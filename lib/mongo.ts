import { MongoClient, ServerApiVersion } from "mongodb";

declare global {
  // eslint-disable-next-line no-var
  var __ost_hibiki_mongo_client__: MongoClient | undefined;
}

const uri = process.env.MONGODB_URI;

export async function getMongoClient(): Promise<MongoClient | null> {
  if (!uri) return null;

  if (!global.__ost_hibiki_mongo_client__) {
    global.__ost_hibiki_mongo_client__ = new MongoClient(uri, {
      serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true
      }
    });
  }

  await global.__ost_hibiki_mongo_client__.connect();

  return global.__ost_hibiki_mongo_client__;
}
