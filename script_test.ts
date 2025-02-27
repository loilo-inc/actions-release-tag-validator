import { assertEquals, assertRejects } from "jsr:@std/assert";
import { getLatestRcTag, main, RunCommand } from "./script.ts";

const mockRunCommand: RunCommand = async (cmd: string, args: string[]) => {
  const fullCmd = `${cmd} ${args.join(" ")}`;
  if (fullCmd === "git tag --points-at fake_sha") {
    return await "";
  }
  if (fullCmd === "git tag") {
    return await "5.5.0-rc1\n5.5.0-rc2\n5.5.0-rc10";
  }
  return "";
};

Deno.test("Test missing GITHUB_REF_NAME", async () => {
  Deno.env.set("GITHUB_REF_NAME", "");
  Deno.env.set("GITHUB_SHA", "fake_sha");

  await assertRejects(
    async () => {
      await main(mockRunCommand);
    },
    Error,
    "Command failed: GITHUB_REF_NAME and GITHUB_SHA are required.",
  );
});

Deno.test("Test missing GITHUB_SHA", async () => {
  Deno.env.set("GITHUB_REF_NAME", "5.5.0");
  Deno.env.set("GITHUB_SHA", "");

  await assertRejects(
    async () => {
      await main(mockRunCommand);
    },
    Error,
    "Command failed: GITHUB_REF_NAME and GITHUB_SHA are required.",
  );
});

Deno.test("Test no valid rc tags found", async () => {
  Deno.env.set("GITHUB_REF_NAME", "5.5.0");
  Deno.env.set("GITHUB_SHA", "fake_sha");

  await assertRejects(
    async () => {
      await main(mockRunCommand);
    },
    Error,
    "Command failed: No valid rc tags found on commit. Aborting.",
  );
});

Deno.test("Tag sorting returns the latest tag correctly", () => {
  const tags = ["5.5.0-rc1", "5.5.0-rc10", "5.5.0-rc2"];
  const latest = getLatestRcTag(tags);
  assertEquals(latest, "5.5.0-rc10");
});

Deno.test("Test valid rc tags with highest matching", async () => {
  const customMockRunCommand: RunCommand = async (
    cmd: string,
    args: string[],
  ) => {
    const fullCmd = `${cmd} ${args.join(" ")}`;
    if (fullCmd === "git tag --points-at fake_sha") {
      return await "5.5.0-rc2\n5.5.0-rc10";
    } else if (fullCmd === "git tag") {
      return await "5.5.0-rc1\n5.5.0-rc2\n5.5.0-rc10\nother-tag";
    }
    return "";
  };

  Deno.env.set("GITHUB_REF_NAME", "5.5.0");
  Deno.env.set("GITHUB_SHA", "fake_sha");

  await main(customMockRunCommand);
});

Deno.test("Test highest rc tag not in valid list", async () => {
  const customMockRunCommand: RunCommand = async (
    cmd: string,
    args: string[],
  ) => {
    const fullCmd = `${cmd} ${args.join(" ")}`;
    if (fullCmd === "git tag --points-at fake_sha") {
      return await "5.5.0-rc2";
    } else if (fullCmd === "git tag") {
      return await "5.5.0-rc2\n5.5.0-rc10";
    }
    return "";
  };

  Deno.env.set("GITHUB_REF_NAME", "5.5.0");
  Deno.env.set("GITHUB_SHA", "fake_sha");

  await assertRejects(
    async () => {
      await main(customMockRunCommand);
    },
    Error,
    "Highest rc tag",
  );
});
