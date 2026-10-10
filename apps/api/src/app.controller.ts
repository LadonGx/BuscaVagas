import { Controller, Get } from '@nestjs/common';

/** `GET /api`: índice para quem abre a API no navegador. */
@Controller()
export class AppController {
  @Get()
  index() {
    return {
      name: 'busca-vagas',
      docs: 'docs/features/ no repositório; exemplos em apps/api/requests.http',
      health: '/api/health',
      resources: {
        jobs: '/api/jobs',
        triage: '/api/jobs/:id/triage · /api/jobs/triage',
        applications: '/api/applications · /api/applications/summary',
        resume: '/api/resume · /api/resume/export',
        discovery: '/api/discovery/sources · /api/discovery/scan · /api/discovery/runs',
        preferences: '/api/preferences · /api/preferences/stacks · /api/preferences/rescore',
      },
    };
  }
}
