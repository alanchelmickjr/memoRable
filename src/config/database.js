import { MongoClient } from 'mongodb';
import { logger } from '../utils/logger.js';

let client = null;

export async function setupDatabase() {
  try {
    const uri = process.env.MONGODB_URI;
    if (!uri) {
      throw new Error('MONGODB_URI environment variable is not set');
    }

    // Check if TLS is required (docdb.amazonaws.com or tls=true in URI)
    const isDocumentDB = uri.includes('docdb.amazonaws.com') || uri.includes('tls=true');

    client = new MongoClient(uri, {
      // For AWS DocumentDB compatibility
      ...(isDocumentDB ? {
        tlsAllowInvalidCertificates: true,
        authMechanism: 'SCRAM-SHA-1', // DocumentDB doesn't support SCRAM-SHA-256
        directConnection: true,
      } : {}),
    });

    await client.connect();
    logger.info('Successfully connected to MongoDB');

    // Create time series collections
    const db = client.db('memorable');
    
    // Create collections with time series configuration
    await createTimeSeriesCollection(db, 'emotions', 'timestamp');
    await createTimeSeriesCollection(db, 'interactions', 'timestamp');
    await createTimeSeriesCollection(db, 'contextual_data', 'timestamp');
    
    return client;
  } catch (error) {
    logger.error('MongoDB connection error:', error);
    throw error;
  }
}

async function createTimeSeriesCollection(db, collectionName, timeField) {
  try {
    await db.createCollection(collectionName, {
      timeseries: {
        timeField,
        metaField: "metadata",
        granularity: "seconds"
      }
    });
    logger.info(`Created time series collection: ${collectionName}`);
  } catch (error) {
    // Collection might already exist
    if (error.code !== 48) { // 48 is the error code for "collection already exists"
      throw error;
    }
  }
}

export function getDatabase() {
  if (!client) {
    throw new Error('Database not initialized. Call setupDatabase first.');
  }
  return client.db('memorable');
}

export async function closeDatabase() {
  if (client) {
    await client.close();
    client = null;
    logger.info('MongoDB connection closed');
  }
}