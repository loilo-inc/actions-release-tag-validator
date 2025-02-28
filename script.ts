import { escape } from "@std/regexp";

export type RunCommand = (cmd: string, args: string[]) => Promise<string>;

export async function runCommand(cmd: string, args: string[]): Promise<string> {
  const command = new Deno.Command(cmd, {
    args,
    stdout: "piped",
    stderr: "piped",
  });
  const { stdout, stderr, code } = await command.output();
  if (code !== 0) {
    const errorStr = new TextDecoder().decode(stderr);
    throw new Error(`Command failed: ${cmd} ${args.join(" ")}\n${errorStr}`);
  }
  return new TextDecoder().decode(stdout);
}

export async function deleteTagAndReleaseOnError(
  err: Error,
  command: RunCommand = runCommand,
): Promise<never> {
  const refName = Deno.env.get("GITHUB_REF_NAME") ?? "";
  const sha = Deno.env.get("GITHUB_SHA") ?? "";

  if (refName) {
    console.log("Deleting the current tag...");
    await command("git", ["push", "origin", "--delete", refName]);
  }
  if (sha) {
    console.log("Deleting the current release...");
    await command("gh", ["release", "delete", refName, "--yes"]);
  }

  throw new Error(err.message);
}

export async function main(command: RunCommand = runCommand) {
  const refName = Deno.env.get("GITHUB_REF_NAME") ?? "";
  const sha = Deno.env.get("GITHUB_SHA") ?? "";

  try {
    if (!refName || !sha) {
      throw new Error(
        "GITHUB_REF_NAME and GITHUB_SHA environment variables are required.",
      );
    }

    console.log(`Ref: ${refName}, SHA: ${sha}`);

    const currentTags = await command("git", ["tag", "--points-at", sha]);
    const rcTags: string[] = currentTags.split("\n").filter((tag: string) => {
      const escapedRefName = escape(refName);
      return new RegExp(`^v?${escapedRefName}-rc[1-9][0-9]*$`).test(tag);
    });

    if (rcTags.length === 0) {
      throw new Error("No valid rc tags found on commit. Aborting.");
    }
    console.log("Valid rc tags found:\n", rcTags);

    const allTags = (await command("git", ["tag"])).split("\n");
    const allRcTags: string[] = allTags.filter((tag: string) => {
      const escapedRefName = escape(refName);
      return new RegExp(`^v?${escapedRefName}-rc[1-9][0-9]*$`).test(tag);
    });

    const latestRcTag = getLatestRcTag(allRcTags);
    console.log("Latest rc tag:", latestRcTag);

    if (!latestRcTag || !rcTags.includes(latestRcTag)) {
      throw new Error(
        `Highest rc tag ${latestRcTag} is not found in the valid rc tags list. Aborting.`,
      );
    }
  } catch (error) {
    throw new Error(
      "Command failed: " +
        (error instanceof Error ? error.message : String(error)),
    );
  }
}

export function getLatestRcTag(allRcTags: string[]): string | undefined {
  return allRcTags.sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true })
  ).pop();
}

if (import.meta.main) {
  main().catch((err) => deleteTagAndReleaseOnError(err));
}
