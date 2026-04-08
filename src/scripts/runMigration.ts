/**
 * Script para executar migrations do PostgreSQL
 * Executa todas as migrations na pasta migrations/ em ordem numérica
 */

import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { pgPool } from '../config/databases';

async function runMigrations() {
  console.log('🔄 Iniciando migrations do microserviço Instagram (OnlyFlow)...');

  try {
    const migrationsDir = join(__dirname, '../database/migrations');
    const files = readdirSync(migrationsDir)
      .filter((file) => file.endsWith('.sql'))
      .sort(); // Ordenar por nome (001_, 002_, etc.)

    if (files.length === 0) {
      console.log('⚠️ Nenhuma migration encontrada');
      return;
    }

    console.log(`📋 Encontradas ${files.length} migration(s): ${files.join(', ')}`);

    const client = await pgPool.connect();
    try {
      await client.query('BEGIN');

      for (const file of files) {
        const migrationPath = join(migrationsDir, file);
        const migrationSQL = readFileSync(migrationPath, 'utf-8');

        console.log(`\n🔄 Executando migration: ${file}`);
      await client.query(migrationSQL);
        console.log(`✅ Migration ${file} executada com sucesso!`);
      }

      await client.query('COMMIT');
      console.log('\n✅ Todas as migrations executadas com sucesso!');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('❌ Erro ao executar migrations:', error);
    process.exit(1);
  } finally {
    await pgPool.end();
    process.exit(0);
  }
}

runMigrations();
