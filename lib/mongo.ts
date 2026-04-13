import { MongoClient } from 'mongodb';

let clientPromise: Promise<MongoClient> | null = null;

export function getMongoClient() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error('MONGODB_URI 未配置');
  }

  if (!clientPromise) {
    clientPromise = new MongoClient(uri).connect();
  }

  return clientPromise;
}

export function getMongoDatabaseName() {
  return process.env.MONGODB_DB ?? 'ost_hibiki';
}
