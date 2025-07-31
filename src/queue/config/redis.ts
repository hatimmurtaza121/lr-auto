import Redis from 'ioredis';

// Redis connection configuration for BullMQ
const redisConfig = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD || undefined,
  maxRetriesPerRequest: null, // BullMQ requirement
  retryDelayOnFailover: 100,
  lazyConnect: true, // Don't connect immediately
};

// Create Redis connection for BullMQ
export const createRedisConnection = () => {
  return new Redis(redisConfig);
};

// Test Redis connection
export const testRedisConnection = async () => {
  try {
    const redis = createRedisConnection();
    await redis.ping();
    await redis.disconnect();
             console.log('Redis connection successful');
    return true;
  } catch (error) {
    console.error('❌ Redis connection failed:', error);
    return false;
  }
}; 