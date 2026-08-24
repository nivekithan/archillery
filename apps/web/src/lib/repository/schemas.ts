import { z } from 'zod'

export const UsernameSchema = z
  .string()
  .min(1, 'Repository owner is required')
  .max(30, 'Repository owner must be 30 characters or fewer')
  .regex(/^[A-Za-z0-9_]+$/, 'Repository owner contains invalid characters')

export const RepositoryNameSchema = z
  .string()
  .transform((value) => (value.endsWith('.git') ? value.slice(0, -4) : value))
  .pipe(
    z
      .string()
      .min(1, 'Repository name is required')
      .max(30, 'Repository name must be 30 characters or fewer')
      .regex(/^[A-Za-z0-9_-]+$/, 'Repository name contains invalid characters'),
  )

export const TreePathSchema = z
  .string()
  .min(1)
  .refine(isTreePath, 'Invalid repository path')

function isTreePath(value: string) {
  return (
    !value.startsWith('/') &&
    !value.includes('\0') &&
    value
      .split('/')
      .every((segment) => segment !== '' && segment !== '.' && segment !== '..')
  )
}
