import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Client } from '@opensearch-project/opensearch';

@Injectable()
export class OpenSearchService implements OnModuleInit {
  private readonly logger = new Logger(OpenSearchService.name);
  private client: Client;
  private readonly indexName = 'students';
  private readonly isDisabled = process.env.DISABLE_OPENSEARCH === 'true';

  constructor() {
    if (this.isDisabled) {
      this.logger.warn('OpenSearch is disabled via DISABLE_OPENSEARCH env variable');
      return;
    }
    
    this.client = new Client({
      node: 'https://localhost:9200', // OpenSearch defaults to HTTPS
      auth: {
        username: 'admin',
        password: 'Ppp_os_password123!'
      },
      ssl: {
        rejectUnauthorized: false
      }
    });
  }

  async onModuleInit() {
    if (this.isDisabled) return;
    try {
      const { body: exists } = await this.client.indices.exists({ index: this.indexName });
      if (!exists) {
        await this.client.indices.create({
          index: this.indexName,
          body: {
            mappings: {
              properties: {
                id: { type: 'keyword' },
                firstName: { type: 'text' },
                lastName: { type: 'text' },
                dni: { type: 'keyword' },
                program: { type: 'keyword' },
                academicPeriod: { type: 'keyword' }
              }
            }
          }
        });
        this.logger.log(`OpenSearch index '${this.indexName}' created successfully.`);
      }
    } catch (error) {
      this.logger.error('Error initializing OpenSearch index:', error);
    }
  }

  async indexStudent(studentData: any) {
    if (this.isDisabled) return;
    try {
      await this.client.index({
        id: studentData.id,
        index: this.indexName,
        body: {
          id: studentData.id,
          firstName: studentData.firstName,
          lastName: studentData.lastName,
          dni: studentData.dni,
          program: studentData.programName,
          academicPeriod: studentData.academicPeriod
        },
        refresh: true,
      });
    } catch (error) {
      this.logger.error('Error indexing student in OpenSearch', error);
    }
  }

  async searchStudents(query: string, period?: string) {
    if (this.isDisabled) return null; // Devuelve null para indicar que está deshabilitado
    try {
      const must: any[] = [];
      
      if (query) {
        must.push({
          multi_match: {
            query,
            fields: ['firstName^2', 'lastName^2', 'dni']
          }
        });
      }

      if (period) {
        must.push({
          term: { academicPeriod: period }
        });
      }

      if (must.length === 0) {
        must.push({ match_all: {} });
      }

      const { body } = await this.client.search({
        index: this.indexName,
        body: {
          query: {
            bool: {
              must
            }
          }
        }
      });

      return body.hits.hits.map((hit: any) => hit._source);
    } catch (error) {
      this.logger.error('Error searching students in OpenSearch', error);
      return [];
    }
  }
}
