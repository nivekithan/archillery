---
name: Simplify
description: Use this skill to simplify the code once you have completed all todos
---


### Don't use `RequestHandler` in controllers use `Request` and `Response` from express types


Change this from 
```ts
export const getPerformanceRiskFraudKpis: RequestHandler = async (req, res) => {
	const userId = req.auth.userId;

	const parsed = validateSchema(keyMetricsQuerySchema, req.query);
	const { start_date, end_date } = parsed.data;

	const data = await AnalyticsService.getPerformanceRiskFraudKpis({
		userId,
		start_date,
		end_date,
	});

	return sendSuccess(res, { data });
};
```
to
```ts
export const getPerformanceRiskFraudKpis = async (req: Request, res: Response) => {
	const userId = req.auth.userId;

	const parsed = validateSchema(keyMetricsQuerySchema, req.query);
	const { start_date, end_date } = parsed.data;

	const data = await AnalyticsService.getPerformanceRiskFraudKpis({
		userId,
		start_date,
		end_date,
	});

	return sendSuccess(res, { data });
};
```

### Use named paratmers through object paramters when there are more than two parameters in a function

Example, change this from 

```ts
export const fooBar = async (paramter1: number, paramter2: number, paramter3: boolean) => {
};
```

to 
```ts
export const fooBar = async ({paramter1, paramter2, paramter3} : {paramter1: number, paramter2: number, paramter3: boolean}) => {
};
```

### Array parameters should not be optional

If a function parameter is an array type, do not make it optional. Use an empty array to represent no values.

Change this from

```ts
const getCampaignMetrics = async ({ campaignIds }: { campaignIds?: string[] }) => {
};
```

to

```ts
const getCampaignMetrics = async ({ campaignIds }: { campaignIds: string[] }) => {
};
```

Callers should pass an empty array when there is no filter:

```ts
await getCampaignMetrics({ campaignIds: [] });
```

### Prefer early returns to reduce nesting

When a branch can return, throw, or otherwise finish the function, handle it first and return early. Keep the main continuing path at the lowest indentation level.

Change this from

```ts
export async function resolveRecord({ id, userId }: { id: string; userId: string }) {
	const existingRecord = await findRecord(id);

	if (existingRecord) {
		if (existingRecord.user_id !== userId) {
			throw new Error("Invalid record.");
		}

		return existingRecord;
	}

	const record = await createRecord({ id, user_id: userId });
	return record;
}
```

to

```ts
export async function resolveRecord({ id, userId }: { id: string; userId: string }) {
	const existingRecord = await findRecord(id);

	if (!existingRecord) {
		return createRecord({ id, user_id: userId });
	}

	if (existingRecord.user_id !== userId) {
		throw new Error("Invalid record.");
	}

	return existingRecord;
}
```

### Organize functions around exported entrypoints

Order functions in a file so exported functions are easy to find first, and keep private helpers near the exported function that uses them.

Use this rough order:

```ts
// imports

export function exportedFunctionOne() {}

function helperOnlyUsedByExportedFunctionOne() {}

export function exportedFunctionTwo() {}

function helperOnlyUsedByExportedFunctionTwo() {}

function sharedPrivateHelperUsedAcrossMultipleFunctions() {}
```

If a helper is used by multiple exported functions, put it after the exported functions and their single-use helpers. If a helper is a generic utility used across the file, keep it near the bottom.

### Keep try/catch blocks simple

A function should ideally have zero or one `try/catch` statement. When a function has a `try/catch`, it should span the total length of the function body.

If you need separate `try/catch` blocks for distinct operations, move those operations into separate functions instead.

Change this from

```ts
const resolveSmartImportRefForAi = async (ref: string | null): Promise<string | null> => {
	if (!ref) {
		return null;
	}

	return resolveSmartImportRefUrlForAi(ref);
};

const resolveSmartImportRefUrlForAi = async (ref: string): Promise<string> => {
	try {
		const url = new URL(ref);
		return await fetchSmartImportFinalUrl(url);
	} catch {
		return ref;
	}
};

const fetchSmartImportFinalUrl = async (url: URL): Promise<string> => {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), 5000);

	try {
		const response = await fetch(url.toString(), {
			method: "GET",
			redirect: "follow",
			signal: controller.signal,
		});

		await response.body?.cancel().catch(() => undefined);
		return response.url || url.toString();
	} finally {
		clearTimeout(timeout);
	}
};
```

to

```ts
const resolveSmartImportRefForAi = async (ref: string | null): Promise<string | null> => {
	try {
		if (!ref) {
			return null;
		}

		const url = new URL(ref);
		return await fetchSmartImportFinalUrl(url);
	} catch {
		return ref;
	}
};

const fetchSmartImportFinalUrl = async (url: URL): Promise<string> => {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), 5000);

	try {
		const response = await fetch(url.toString(), {
			method: "GET",
			redirect: "follow",
			signal: controller.signal,
		});

		await response.body?.cancel().catch(() => undefined);
		return response.url || url.toString();
	} finally {
		clearTimeout(timeout);
	}
};
```


### How to perform normalization

Normalization can be performed in two seceniors 

1. On service boundary when processing untrusted input 
2. Converting the database types to Typesctipt types


**Service level normalization**
All the normalization should be moved service boundary where we accepting untrusted input. Examples of service boundary 

1. User input in API requests like body or query params. We will perform the normalization in zod schema
2. In case the input is CSV file, we perform the normalziation while processing CSV files 

Do not add extra normalization or validation helper functions inside downstream service functions just because those functions could be called outside the controller/schema path. The caller is responsible for passing values that satisfy the callee's contract. If a service function requires an already-normalized or already-validated value, document that requirement in a short comment or type-level naming instead of duplicating the Zod validation in the service.

Example, avoid this when `shortLinkRef` is already validated by the request schema:

```ts
const validateShortLinkRef = (shortLinkRef: string) => {
	if (!/^[a-zA-Z0-9]+$/.test(shortLinkRef)) {
		throw new BadRequestError("Short link ref must contain only letters and numbers");
	}
	return shortLinkRef;
};

const createShortLink = async ({ shortLinkRef }: { shortLinkRef: string }) => {
	const validatedShortLinkRef = validateShortLinkRef(shortLinkRef);
	// ...
};
```

Prefer this:

```ts
const createShortLink = async ({ shortLinkRef }: { shortLinkRef: string }) => {
	// shortLinkRef is expected to be trimmed and validated by the caller.
	// ...
};
```

**Database types -> Typescript  types**

Typescirpt has rich type system like unions, discriminated unions and more. Most of these can't be represented thorugh database types. 

So at the database service layer we have to perform the normalization where we can onvert the database type to rich typescript system

**!IMPORTANT** No where else we should perform normalization. If you disagree ask perfmission to the user before performing this




### Use parital index where necessary 

In almost all cases whereever we have table eith `deleted_at` present we will need to use patital index with `where deleted_at is null` clause
