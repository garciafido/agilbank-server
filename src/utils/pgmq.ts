import { basePrisma as prisma } from "../prisma/client";

interface PGMQMessage {
  msg_id: number;
  read_ct: number;
  enqueued_at: Date;
  vt: Date;
  message: any;
}

interface PGMQOptions {
  vt?: number; // visibility timeout in seconds
}

// Cliente mínimo aceptado por las operaciones de escritura: el singleton
// basePrisma o un cliente de $transaction. Pasar el cliente transaccional
// hace que el mensaje se vuelva visible ATÓMICAMENTE con el commit del
// caller (pgmq vive en el mismo Postgres): un mensaje jamás puede ser
// consumido antes de que las filas que referencia (p.ej. worker_event)
// estén commiteadas. Sin cliente, autocommitea (comportamiento histórico).
export type PgmqWriteClient = {
  $queryRaw<T = unknown>(
    query: TemplateStringsArray,
    ...values: any[]
  ): Promise<T>;
};

class PGMQ {
  /**
   * Send a message to a queue
   */
  async send(
    queue: string,
    message: any,
    options?: PGMQOptions,
    client?: PgmqWriteClient
  ): Promise<number> {
    const db = client ?? prisma;
    const result = await db.$queryRaw<[{ send: number }]>`
      SELECT pgmq.send(
        ${queue}::text,
        ${JSON.stringify(message)}::jsonb,
        ${options?.vt || 0}::integer
      ) as send
    `;

    return result[0].send;
  }

  /**
   * Send multiple messages to a queue
   */
  async sendBatch(
    queue: string,
    messages: any[],
    client?: PgmqWriteClient
  ): Promise<number[]> {
    const db = client ?? prisma;
    const jsonMessages = messages.map((m) => JSON.stringify(m));
    const result = await db.$queryRaw<[{ send_batch: number[] }]>`
      SELECT pgmq.send_batch(
        ${queue}::text,
        ARRAY[${jsonMessages.join(",")}]::jsonb[]
      ) as send_batch
    `;

    return result[0].send_batch;
  }

  /**
   * Read a message from a queue
   */
  async read(queue: string, vt?: number): Promise<PGMQMessage | null> {
    const result = await prisma.$queryRaw<PGMQMessage[]>`
      SELECT * FROM pgmq.read(
        ${queue}::text,
        ${vt || 30}::integer,
        1::integer
      )
    `;

    return result[0] || null;
  }

  /**
   * Read multiple messages from a queue
   */
  async readBatch(
    queue: string,
    vt: number,
    quantity: number
  ): Promise<PGMQMessage[]> {
    const result = await prisma.$queryRaw<PGMQMessage[]>`
      SELECT * FROM pgmq.read(
        ${queue}::text,
        ${vt}::integer,
        ${quantity}::integer
      )
    `;

    return result;
  }

  /**
   * Archive (delete) a message
   */
  async delete(queue: string, msgId: number): Promise<boolean> {
    const result = await prisma.$queryRaw<[{ archive: boolean }]>`
      SELECT pgmq.archive(
        ${queue}::text,
        ${msgId}::bigint
      ) as archive
    `;

    return result[0].archive;
  }

  /**
   * Archive multiple messages
   */
  async deleteBatch(queue: string, msgIds: number[]): Promise<number[]> {
    const result = await prisma.$queryRaw<[{ archive_batch: number[] }]>`
      SELECT pgmq.archive_batch(
        ${queue}::text,
        ARRAY[${msgIds.join(",")}]::bigint[]
      ) as archive_batch
    `;

    return result[0].archive_batch;
  }

  /**
   * Get queue metrics
   */
  async metrics(queue: string): Promise<any> {
    const result = await prisma.$queryRaw`
      SELECT 
        queue_name,
        queue_length,
        newest_msg_age_sec,
        oldest_msg_age_sec,
        total_messages
      FROM pgmq.metrics
      WHERE queue_name = ${queue}
    `;

    return result[0] || null;
  }

  /**
   * Get all queue metrics
   */
  async allMetrics(): Promise<any[]> {
    const result = await prisma.$queryRaw`
      SELECT 
        queue_name,
        queue_length,
        newest_msg_age_sec,
        oldest_msg_age_sec,
        total_messages
      FROM pgmq.metrics
    `;

    return result;
  }

  /**
   * Create a new queue
   */
  async createQueue(queue: string): Promise<void> {
    await prisma.$executeRaw`
      SELECT pgmq.create(${queue}::text)
    `;
  }

  /**
   * Drop a queue
   */
  async dropQueue(queue: string): Promise<void> {
    await prisma.$executeRaw`
      SELECT pgmq.drop_queue(${queue}::text)
    `;
  }

  /**
   * Purge all messages from a queue
   */
  async purgeQueue(queue: string): Promise<number> {
    const result = await prisma.$queryRaw<[{ purge_queue: number }]>`
      SELECT pgmq.purge_queue(${queue}::text) as purge_queue
    `;

    return result[0].purge_queue;
  }
}

// Export singleton instance
export const pgmq = new PGMQ();

// Export for pipeline integration
// client: pasar el cliente de la transacción que creó el worker_event para
// publicar el mensaje en esa misma transacción (ver PgmqWriteClient).
export const enqueuePipelineJob = async (
  pipelineId: string,
  stageId: string,
  input: any,
  options?: PGMQOptions,
  client?: PgmqWriteClient
): Promise<number> => {
  const { workerEventId, proxyConfig, regionConfig, ...restInput } = input;
  return pgmq.send(
    "pipeline_jobs",
    {
      pipelineId,
      stageId,
      input: restInput,
      workerEventId,
      proxyConfig,
      regionConfig,
      timestamp: new Date(),
    },
    options,
    client
  );
};
