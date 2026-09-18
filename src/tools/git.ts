import { z } from 'zod';
import type { Tool } from './Tool';

const reposInputSchema = z.object({ system: z.string().min(1) }).strict();

/** Tier A. Lists abapGit repositories linked to the system - read-only. */
export const gitReposTool: Tool<z.infer<typeof reposInputSchema>> = {
  name: 'adt_git_repos',
  description: 'Lists abapGit repositories linked to the connected system.',
  inputSchema: reposInputSchema,
  execute: (gateway, args) => gateway.gitRepos(args.system),
};

const packageScopeField = z
  .string()
  .optional()
  .describe(
    "The linked repository's package, if known (see adt_git_repos) - used only for this system's allowPackages/denyPackages guardrail scoping, never sent to SAP.",
  );

const pullInputSchema = z
  .object({
    system: z.string().min(1),
    repositoryKey: z.string().min(1),
    branch: z.string().optional(),
    packageName: packageScopeField,
  })
  .strict();

/** Tier C. Pulls a linked abapGit repository - overwrites local objects from the remote. */
export const gitPullTool: Tool<z.infer<typeof pullInputSchema>> = {
  name: 'adt_git_pull',
  description: 'Pulls a linked abapGit repository, returning the objects the pull changed.',
  inputSchema: pullInputSchema,
  execute: (gateway, args) => gateway.gitPull(args.system, { repositoryKey: args.repositoryKey, branch: args.branch }),
};

const pushInputSchema = z
  .object({
    system: z.string().min(1),
    repositoryKey: z.string().min(1),
    comment: z.string().min(1),
    packageName: packageScopeField,
  })
  .strict();

/** Tier C. Stages and pushes local changes to a linked abapGit repository. */
export const gitPushTool: Tool<z.infer<typeof pushInputSchema>> = {
  name: 'adt_git_push',
  description: 'Stages and pushes local changes to a linked abapGit repository.',
  inputSchema: pushInputSchema,
  execute: (gateway, args) => gateway.gitPush(args.system, { repositoryKey: args.repositoryKey, comment: args.comment }),
};

export const gitTools = [gitReposTool, gitPullTool, gitPushTool];
