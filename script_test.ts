import { assertEquals, assertRejects } from "jsr:@std/assert";
import { getLatestRcTag, main } from "./script.ts";

const mockExeca: (command: string) => Promise<{ stdout: string }> = async (
  command: string,
) => {
  if (command.startsWith("git tag --points-at")) {
    return await { stdout: "" };
  } else if (command === "git tag") {
    return await { stdout: "5.5.0-rc1\n5.5.0-rc2\n5.5.0-rc10" };
  } else if (command.startsWith("git push origin --delete")) {
    return await { stdout: "deleted" };
  } else if (command.startsWith("gh release delete")) {
    return await { stdout: "deleted" };
  }
  return await { stdout: "" };
};

Deno.test("Test missing GITHUB_REF_NAME", async () => {
  Deno.env.set("GITHUB_REF_NAME", "");
  Deno.env.set("GITHUB_SHA", "fake_sha");

  await assertRejects(
    async () => {
      await main(mockExeca);
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
      await main(mockExeca);
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
      await main(mockExeca);
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
  const customMockExeca = async (command: string) => {
    if (command.startsWith("git tag --points-at")) {
      return await { stdout: "5.5.0-rc2\n5.5.0-rc10" };
    } else if (command === "git tag") {
      return await { stdout: "5.5.0-rc1\n5.5.0-rc2\n5.5.0-rc10\nother-tag" };
    } else if (command.startsWith("git push origin --delete")) {
      return await { stdout: "deleted" };
    } else if (command.startsWith("gh release delete")) {
      return await { stdout: "deleted" };
    }
    return await { stdout: "" };
  };

  Deno.env.set("GITHUB_REF_NAME", "5.5.0");
  Deno.env.set("GITHUB_SHA", "fake_sha");

  await main(customMockExeca);
});

Deno.test("Test highest rc tag not in valid list", async () => {
  const customMockExeca = async (command: string) => {
    if (command.startsWith("git tag --points-at")) {
      return await { stdout: "5.5.0-rc2" };
    } else if (command === "git tag") {
      return await { stdout: "5.5.0-rc2\n5.5.0-rc10" };
    } else if (command.startsWith("git push origin --delete")) {
      return await { stdout: "deleted" };
    } else if (command.startsWith("gh release delete")) {
      return await { stdout: "deleted" };
    }
    return await { stdout: "" };
  };

  Deno.env.set("GITHUB_REF_NAME", "5.5.0");
  Deno.env.set("GITHUB_SHA", "fake_sha");

  await assertRejects(
    async () => {
      await main(customMockExeca);
    },
    Error,
    "Highest rc tag",
  );
});
