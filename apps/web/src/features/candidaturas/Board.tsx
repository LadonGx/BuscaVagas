import type { ApplicationDto, ApplicationStatus } from '@busca-vagas/shared';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { useState } from 'react';
import { Button } from '../../components/ui/Button';
import { Drawer } from '../../components/ui/Drawer';
import { ApplicationCard } from './ApplicationCard';
import { BOARD_COLUMNS, columnOf, type BoardColumn } from './columns';
import styles from './Board.module.css';

interface BoardProps {
  applications: ApplicationDto[];
  now: Date;
  selectedId: string | null;
  onOpen: (id: string) => void;
  onMove: (id: string, status: ApplicationStatus) => void;
}

/**
 * O que acontece ao soltar um cartão numa coluna: o novo status, `'ask'`
 * (Encerradas: recusa ou desistência?) ou `null` (mesma coluna / fora).
 */
export function dropResult(
  status: ApplicationStatus,
  columnId: string | undefined,
): ApplicationStatus | 'ask' | null {
  const target = BOARD_COLUMNS.find((column) => column.id === columnId);
  if (!target || columnOf(status).id === target.id) return null;
  return target.dropStatus ?? 'ask';
}

function DraggableCard(props: Omit<Parameters<typeof ApplicationCard>[0], 'cardRef'>) {
  const { setNodeRef, listeners, isDragging } = useDraggable({ id: props.application.id });
  // Só os "listeners" de ponteiro: pelo teclado, o caminho é o "Mover para…".
  return <ApplicationCard {...props} cardRef={setNodeRef} dragging={isDragging} {...listeners} />;
}

function Column({
  column,
  children,
  count,
}: {
  column: BoardColumn;
  children: React.ReactNode;
  count: number;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id });
  return (
    <section
      ref={setNodeRef}
      className={styles.column}
      data-over={isOver || undefined}
      aria-labelledby={`coluna-${column.id}`}
    >
      <h2 id={`coluna-${column.id}`} className={styles.columnTitle}>
        <span className={styles.dot} data-column={column.id} aria-hidden="true" />
        {column.title}
        <span className={styles.count}>{count}</span>
      </h2>
      {children}
    </section>
  );
}

/**
 * Quadro por status. Arrastar um cartão para outra coluna registra o evento;
 * soltar em "Encerradas" pergunta se foi recusa ou desistência.
 */
export function Board({ applications, now, selectedId, onOpen, onMove }: BoardProps) {
  const sensors = useSensors(
    // Arrasto só depois de 6 px: clique simples abre o cartão normalmente.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
  );
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [closing, setClosing] = useState<ApplicationDto | null>(null);
  const dragging = applications.find((application) => application.id === draggingId);

  function onDragStart(event: DragStartEvent) {
    setDraggingId(String(event.active.id));
  }

  function onDragEnd(event: DragEndEvent) {
    setDraggingId(null);
    const application = applications.find((item) => item.id === event.active.id);
    if (!application) return;
    const result = dropResult(application.status, event.over ? String(event.over.id) : undefined);
    if (result === 'ask') setClosing(application);
    else if (result) onMove(application.id, result);
  }

  return (
    <>
      <DndContext
        sensors={sensors}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragCancel={() => setDraggingId(null)}
      >
        <div className={styles.board}>
          {BOARD_COLUMNS.map((column) => {
            const cards = applications.filter((application) =>
              column.statuses.includes(application.status),
            );
            return (
              <Column key={column.id} column={column} count={cards.length}>
                {cards.length === 0 ? (
                  <p className={styles.empty}>Nada aqui. Arraste um cartão para cá.</p>
                ) : (
                  cards.map((application) => (
                    <DraggableCard
                      key={application.id}
                      application={application}
                      now={now}
                      selected={application.id === selectedId}
                      onOpen={onOpen}
                      onMove={(id, status) => onMove(id, status)}
                    />
                  ))
                )}
              </Column>
            );
          })}
        </div>
        <DragOverlay>
          {dragging && <ApplicationCard application={dragging} now={now} />}
        </DragOverlay>
      </DndContext>

      <Drawer
        open={Boolean(closing)}
        onClose={() => setClosing(null)}
        placement="center"
        title="Como terminou?"
        eyebrow={closing ? `${closing.job.title} · ${closing.job.company}` : undefined}
        footer={
          <>
            <Button
              variant="primary"
              onClick={() => {
                if (closing) onMove(closing.id, 'rejected');
                setClosing(null);
              }}
            >
              A empresa recusou
            </Button>
            <Button
              onClick={() => {
                if (closing) onMove(closing.id, 'withdrawn');
                setClosing(null);
              }}
            >
              Eu desisti
            </Button>
          </>
        }
      >
        <p className={styles.muted}>
          A candidatura vai para Encerradas. Dá para corrigir a data na linha do tempo.
        </p>
      </Drawer>
    </>
  );
}
