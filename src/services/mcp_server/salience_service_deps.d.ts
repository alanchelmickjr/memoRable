/**
 * Type declarations for salience_service dependencies.
 * These declarations allow TypeScript to compile the salience_service
 * even when the actual packages aren't installed (they're optional).
 */

// MongoDB types (simplified for salience service usage)
declare module 'mongodb' {
  export class MongoClient {
    constructor(uri: string);
    connect(): Promise<MongoClient>;
    db(name?: string): Db;
    close(): Promise<void>;
  }

  export class ObjectId {
    constructor(id?: string);
    toString(): string;
    toHexString(): string;
    static isValid(id: any): boolean;
  }

  export interface Db {
    collection<T = any>(name: string): Collection<T>;
    listCollections(filter?: object): { toArray(): Promise<any[]> };
    createCollection(name: string): Promise<Collection>;
    command(command: object): Promise<any>;
  }

  export interface Collection<T = any> {
    find(filter?: object): FindCursor<T>;
    findOne(filter: object, options?: { sort?: object; projection?: object }): Promise<T | null>;
    insertOne(doc: T): Promise<{ insertedId: any }>;
    insertMany(docs: T[]): Promise<{ insertedIds: Record<number, any> }>;
    updateOne(filter: object, update: object, options?: { upsert?: boolean }): Promise<any>;
    updateMany(filter: object, update: object, options?: { upsert?: boolean }): Promise<any>;
    deleteOne(filter: object): Promise<{ deletedCount: number }>;
    deleteMany(filter: object): Promise<{ deletedCount: number }>;
    countDocuments(filter?: object): Promise<number>;
    createIndex(spec: IndexSpecification, options?: object): Promise<string>;
    distinct(field: string, filter?: object): Promise<any[]>;
    aggregate(pipeline: object[]): { toArray(): Promise<any[]> };
  }

  export interface FindCursor<T> {
    toArray(): Promise<T[]>;
    sort(spec: object): FindCursor<T>;
    limit(n: number): FindCursor<T>;
    skip(n: number): FindCursor<T>;
  }

  export type IndexSpecification = Record<string, 1 | -1 | 'text'>;
  export type OptionalId<T> = Omit<T, '_id'> & { _id?: any };
}

// UUID types
declare module 'uuid' {
  export function v4(): string;
  export function v1(): string;
}

// AWS Bedrock types (optional - only used when Bedrock is configured)
declare module '@aws-sdk/client-bedrock-runtime' {
  export class BedrockRuntimeClient {
    constructor(config: { region: string });
    send(command: InvokeModelCommand): Promise<{ body: Uint8Array }>;
  }

  export class InvokeModelCommand {
    constructor(input: {
      modelId: string;
      contentType: string;
      accept: string;
      body: string;
    });
  }
}
