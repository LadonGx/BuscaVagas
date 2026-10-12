import {
  CONTRACT_LABELS,
  CONTRACT_TYPES,
  SENIORITY_LABELS,
  SENIORITY_LEVELS,
  WORK_MODEL_LABELS,
  WORK_MODELS,
  type PreferencesDto,
} from '@busca-vagas/shared';
import { useState, type FormEvent } from 'react';
import { ApiError } from '../../api/client';
import { usePreferences, useSavePreferences } from '../../api/preferences';
import { useToast } from '../../components/toast/toast-context';
import { useUnsavedChanges } from '../../components/UnsavedChanges';
import { PageHeader } from '../../components/ui/PageHeader';
import { CleanupCard } from './CleanupCard';
import { ChipList, NumberField, ToggleGroup } from './Fields';
import {
  changedFields,
  errorsFromApi,
  toForm,
  validateForm,
  type FormErrors,
  type FormField,
  type PreferencesForm,
} from './form';
import { ScorePreview } from './ScorePreview';
import { SourcesCard } from './SourcesCard';
import { StackGroups } from './StackGroups';
import styles from './Preferencias.module.css';

export function PreferenciasPage() {
  const { data: saved, isError, error } = usePreferences();

  return (
    <>
      <PageHeader
        title="Preferências"
        subtitle="É daqui que sai a nota de cada vaga. Salvar recalcula tudo em segundo plano."
      />
      {isError && <p className={styles.error}>{error.message}</p>}
      {!saved && !isError && <p className={styles.hint}>Carregando preferências…</p>}
      {/* Depois de salvar, a versão sobe e o formulário recomeça do que a API guardou. */}
      {saved && <Editor key={saved.version} saved={saved} />}
    </>
  );
}

function Editor({ saved }: { saved: PreferencesDto }) {
  const [form, setForm] = useState<PreferencesForm>(() => toForm(saved));
  const [errors, setErrors] = useState<FormErrors>({});
  const savePreferences = useSavePreferences();
  const toast = useToast();
  const dirtyCount = changedFields(form, saved).length;

  function set<K extends FormField>(field: K, value: PreferencesForm[K]) {
    setForm((current) => ({ ...current, [field]: value }));
    if (errors[field]) setErrors((current) => ({ ...current, [field]: undefined }));
  }

  async function save(): Promise<boolean> {
    if (savePreferences.isPending) return false;
    if (dirtyCount === 0) return true;
    const result = validateForm(form);
    if (result.errors) {
      setErrors(result.errors);
      toast.show({ tone: 'error', message: 'Corrija os campos marcados antes de salvar.' });
      return false;
    }
    try {
      const response = await savePreferences.mutateAsync(result.values);
      toast.show(
        response.rescoreQueued
          ? { tone: 'success', message: 'Preferências salvas. Recalculando as notas…' }
          : {
              tone: 'error',
              message:
                'Preferências salvas, mas a fila das notas não respondeu (Redis fora do ar?). Elas são recalculadas quando a fila voltar.',
            },
      );
      return true;
    } catch (saveError) {
      if (saveError instanceof ApiError && saveError.issues.length > 0) {
        setErrors(errorsFromApi(saveError.issues));
      }
      toast.show({ tone: 'error', message: (saveError as Error).message });
      return false;
    }
  }

  const unsaved = useUnsavedChanges({
    count: dirtyCount,
    saving: savePreferences.isPending,
    save,
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    void save();
  }

  return (
    <div className={styles.layout}>
      <form
        id="preferencias-form"
        className={styles.form}
        aria-label="Preferências"
        noValidate
        onSubmit={submit}
      >
        <StackGroups
          form={form}
          errors={errors}
          onChange={(next) => {
            setForm(next);
            setErrors(({ stacksCore: _a, stacksPlus: _b, stacksAvoid: _c, ...rest }) => rest);
          }}
        />

        <section className={styles.card} aria-labelledby="vaga-titulo">
          <h2 id="vaga-titulo" className={styles.cardTitle}>
            A vaga
          </h2>
          <ToggleGroup
            legend="Senioridade"
            options={SENIORITY_LEVELS}
            labels={SENIORITY_LABELS}
            value={form.seniorities}
            onChange={(value) => set('seniorities', value)}
          />
          <ToggleGroup
            legend="Contrato"
            options={CONTRACT_TYPES}
            labels={CONTRACT_LABELS}
            value={form.contractTypes}
            onChange={(value) => set('contractTypes', value)}
          />
          <ToggleGroup
            legend="Modalidade"
            options={WORK_MODELS}
            labels={WORK_MODEL_LABELS}
            value={form.workModels}
            onChange={(value) => set('workModels', value)}
          />
        </section>

        <section className={styles.card} aria-labelledby="onde-titulo">
          <h2 id="onde-titulo" className={styles.cardTitle}>
            Onde, quando e quanto
          </h2>
          <ChipList
            label="Cidades para híbrido ou presencial"
            hint="Vaga híbrida ou presencial em outra cidade fica incompatível. Vazio = qualquer cidade."
            placeholder="+ cidade (Enter adiciona)"
            values={form.cities}
            max={20}
            maxLength={80}
            error={errors.cities}
            onChange={(value) => set('cities', value)}
          />
          <div className={styles.numbers}>
            <NumberField
              label="Idade máxima da vaga"
              hint="Até 7 dias vale a nota cheia; cai até zero nesse limite. Vazio desliga."
              suffix="dias"
              min={1}
              max={365}
              value={form.maxAgeDays}
              error={errors.maxAgeDays}
              onChange={(value) => set('maxAgeDays', value)}
            />
            <NumberField
              label="Salário mínimo"
              hint="Só conta quando a vaga informa salário em reais. Vazio desliga."
              prefix="R$"
              suffix="por mês"
              min={0}
              max={1_000_000}
              placeholder="ex.: 3000"
              value={form.minMonthlySalary}
              error={errors.minMonthlySalary}
              onChange={(value) => set('minMonthlySalary', value)}
            />
          </div>
        </section>

        <section className={styles.card} aria-labelledby="empresas-titulo">
          <h2 id="empresas-titulo" className={styles.cardTitle}>
            Empresas bloqueadas
          </h2>
          <ChipList
            label="Empresas"
            hint="Vaga dessas empresas fica incompatível (nota 0). Enter ou vírgula adiciona; colar uma lista separada por vírgulas também funciona."
            placeholder="+ empresa"
            values={form.blockedCompanies}
            max={100}
            maxLength={200}
            error={errors.blockedCompanies}
            onChange={(value) => set('blockedCompanies', value)}
          />
        </section>
      </form>

      <aside className={styles.aside} aria-label="Resumo e manutenção">
        <ScorePreview
          configured={saved.configured}
          dirtyCount={dirtyCount}
          saving={savePreferences.isPending}
          onSave={() => void save()}
        />
        <SourcesCard />
        <CleanupCard />
      </aside>

      {unsaved.dialog}
    </div>
  );
}
