import { and, eq, gte, sql } from "drizzle-orm";
import { db } from "~/server/db";
import { requests, users } from "~/server/db/schema";

const REQUESTS_PER_MINUTE = 2;

export async function checkRateLimit(userId: string): Promise<boolean> {
	// Check if user is admin
	const user = await db.query.users.findFirst({
		where: eq(users.id, userId),
	});

	if (user?.isAdmin) {
		return true;
	}

	// Get start of current minute in UTC
	const startOfMinute = new Date();
	startOfMinute.setUTCSeconds(0, 0);

	// Count requests made today
	const requestCount = await db
		.select({ count: sql<number>`count(*)` })
		.from(requests)
		.where(
			and(eq(requests.userId, userId), gte(requests.timestamp, startOfMinute)),
		);

	console.debug({
	  limit: REQUESTS_PER_MINUTE,
  	startOfMinute,
  	count: requestCount[0]?.count
	})

	return (requestCount[0]?.count ?? 0) <= REQUESTS_PER_MINUTE;
}

export async function recordRequest(userId: string) {
	await db.insert(requests).values({
		userId,
	});
}
