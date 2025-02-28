import { assertEquals, assertRejects } from "@std/assert";
import {
  deleteTagAndReleaseOnError,
  getLatestRcTag,
  main,
  RunCommand,
} from "./script.ts";

// deno-lint-ignore require-await
const mockRunCommand: RunCommand = async (cmd: string, args: string[]) => {
  const fullCmd = `${cmd} ${args.join(" ")}`;
  if (fullCmd === "git tag --points-at fake_sha") {
    return "";
  }
  if (fullCmd === "git tag") {
    return "5.5.0-rc1\n5.5.0-rc2\n5.5.0-rc10";
  }
  throw new Error(`Unexpected command: ${fullCmd}`);
};

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

  await main("5.5.0", "fake_sha", customMockRunCommand);
});

Deno.test("Test no valid rc tags found", async () => {
  Deno.env.set("GITHUB_REF_NAME", "5.5.0");
  Deno.env.set("GITHUB_SHA", "fake_sha");

  await assertRejects(
    async () => {
      await main("5.5.0", "fake_sha", mockRunCommand);
    },
    Error,
    "No valid rc tags",
  );
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

  await assertRejects(
    async () => {
      await main("5.5.0", "fake_sha", customMockRunCommand);
    },
    Error,
    "Highest rc tag",
  );
});

Deno.test("Tag sorting returns the latest tag correctly", () => {
  const tags = ["5.5.0-rc1", "5.5.0-rc10", "5.5.0-rc2"];
  const latest = getLatestRcTag(tags);
  assertEquals(latest, "5.5.0-rc10");
});

Deno.test("Test deleteTagAndReleaseOnError", async () => {
  // deno-lint-ignore require-await
  const customMockRunCommand: RunCommand = async (
    cmd: string,
    args: string[],
  ) => {
    const fullCmd = `${cmd} ${args.join(" ")}`;
    if (fullCmd.startsWith("git push origin --delete")) {
      return "Deleted tag";
    }
    if (fullCmd.startsWith("gh release delete")) {
      return "Deleted release";
    }
    return "";
  };

  Deno.env.set("GITHUB_REF_NAME", "");
  Deno.env.set("GITHUB_SHA", "");

  await assertRejects(
    async () => {
      await deleteTagAndReleaseOnError(
        new Error("Test error"),
        customMockRunCommand,
      );
    },
    Error,
    "Test error",
  );
});
