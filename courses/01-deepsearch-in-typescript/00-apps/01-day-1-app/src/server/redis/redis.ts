/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-return */

import Redis from "ioredis";
import { env } from "~/env";

export const redis = new Redis(env.REDIS_URL);

const CACHE_EXPIRY_SECONDS = 60 * 60 * 6; // 6 hours
const CACHE_KEY_SEPARATOR = ":";

export const cacheWithRedis = <TFunc extends (...args: any[]) => Promise<any>>(
	keyPrefix: string,
	fn: TFunc,
): TFunc => {
	return (async (...args: Parameters<TFunc>) => {
		const key = `${keyPrefix}${CACHE_KEY_SEPARATOR}${JSON.stringify(args)}`;
		const cachedResult = await redis.get(key);
		if (cachedResult) {
			console.log(`Cache hit for ${key}`);
			return JSON.parse(cachedResult);
		}

		const result = await fn(...args);
		await redis.set(key, JSON.stringify(result), "EX", CACHE_EXPIRY_SECONDS);
		return result;
	}) as TFunc;
};
