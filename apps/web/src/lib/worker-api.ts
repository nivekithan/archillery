import { z } from 'zod'

const ErrorResponseSchema = z.object({
  error: z.string(),
})

export async function readWorkerJson(response: Response): Promise<unknown> {
  const bodyText = await response.text()
  let body: unknown
  try {
    body = JSON.parse(bodyText)
  } catch {
    if (response.ok) {
      throw new Error('Worker returned an invalid response')
    }
  }

  if (!response.ok) {
    const error = ErrorResponseSchema.safeParse(body)
    throw new Error(
      error.success
        ? error.data.error
        : `Worker request failed with status ${response.status}`,
    )
  }

  return body
}
