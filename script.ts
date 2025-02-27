import { execa } from "npm:execa";
import { escape } from "jsr:@std/regexp";

type ExecaRunner = (command: string, args?: string[]) => Promise<{ stdout: string }>;

export async function main() {
  const refName = Deno.env.get("GITHUB_REF_NAME") ?? "";
  const sha = Deno.env.get("GITHUB_SHA") ?? "";

  try {
    if (!refName || !sha) {
      throw new Error("GITHUB_REF_NAME and GITHUB_SHA are required.");
    }

    console.log(`Ref: ${refName}, SHA: ${sha}`);
    // const { stdout } = await runner(`git tag --points-at ${sha}`);
    // const command = new Deno.Command("git", {
      //   args: ["tag", "--points-at", sha],
      //   stdout: "piped",
      // });
    // const { stdout } = await command.output();
    const { stdout } = await execa`git tag --points-at ${sha}`;
    const output = new TextDecoder().decode(stdout);
    const rcTags: string[] = output.split("\n").filter((tag: string) => {
      const escapedRefName = escape(refName);
      return new RegExp(`${escapedRefName}-rc[1-9][0-9]*`).test(tag);
    });

    if (rcTags.length === 0) {
      throw new Error("No valid rc tags found on commit. Aborting.");
    }
    console.log("Valid rc tags found:\n", rcTags);

    // const allTags = (await runner("git tag")).stdout.split("\n");
    // const command2 = new Deno.Command("git", {
    //   args: ["tag"],
    //   stdout: "piped",
    // });
    // const { stdout: stdout2 } = await command2.output();
    // const allTags = new TextDecoder().decode(stdout2).split("\n");
    const allTags = (await execa`git tag`).stdout.split("\n");
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
      await execa("git", ["push", "origin", "--delete", refName]);
      console.log("Deleting the current release...");
      await execa("gh", ["release", "delete", refName, "--yes"]);
    }

    throw new Error(err.message);
  });
}

export function getLatestRcTag(allRcTags: string[]): string | undefined {
  return allRcTags.sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true })
  ).pop();
}
