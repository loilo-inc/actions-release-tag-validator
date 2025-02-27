import { escape } from "jsr:@std/regexp";

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

export async function main(command: RunCommand = runCommand) {
  const refName = Deno.env.get("GITHUB_REF_NAME") ?? "";
  const sha = Deno.env.get("GITHUB_SHA") ?? "";

  try {
    if (!refName || !sha) {
      throw new Error("GITHUB_REF_NAME and GITHUB_SHA are required.");
    }

    console.log(`Ref: ${refName}, SHA: ${sha}`);

    const currentTags = await command("git", ["tag", "--points-at", sha]);
    const rcTags: string[] = currentTags.split("\n").filter((tag: string) => {
      const escapedRefName = escape(refName);
      return new RegExp(`${escapedRefName}-rc[1-9][0-9]*`).test(tag);
    });

    if (rcTags.length === 0) {
      throw new Error("No valid rc tags found on commit. Aborting.");
    }
    console.log("Valid rc tags found:\n", rcTags);

    const allTags = (await command("git", ["tag"])).split("\n");
    const allRcTags: string[] = allTags.filter((tag: string) => {
      const escapedRefName = escape(refName);
      return new RegExp(`^${escapedRefName}-rc[1-9][0-9]*$`).test(tag);
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

if (import.meta.main) {
  main().catch(async (err: Error) => {
    const refName = Deno.env.get("GITHUB_REF_NAME") ?? "";
    const sha = Deno.env.get("GITHUB_SHA") ?? "";

    if (refName && sha) {
      console.log("Deleting the current tag...");
      await new Deno.Command("git", {
        args: ["push", "origin", "--delete", refName],
      }).output();
      console.log("Deleting the current release...");
      await new Deno.Command("gh", {
        args: ["release", "delete", refName, "--yes"],
      }).output();
    }

    throw new Error(err.message);
  });
}

export function getLatestRcTag(allRcTags: string[]): string | undefined {
  return allRcTags.sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true })
  ).pop();
}
