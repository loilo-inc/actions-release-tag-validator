import { assertEquals, assertExists, assertRejects } from "@std/assert";
import {
  deleteTagAndReleaseOnError,
  getLatestRcTag,
  main,
  RunCommand,
  runCommand,
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

Deno.test("Test valid rc tags with `v` prefix and highest matching", async () => {
  const customMockRunCommand: RunCommand = async (
    cmd: string,
    args: string[],
  ) => {
    const fullCmd = `${cmd} ${args.join(" ")}`;
    if (fullCmd === "git tag --points-at fake_sha") {
      return await "v5.5.0-rc2\nv5.5.0-rc10";
    } else if (fullCmd === "git tag") {
      return await "v5.5.0-rc1\nv5.5.0-rc2\nv5.5.0-rc10\nother-tag";
    }
    return "";
  };

  await main("v5.5.0", "fake_sha", customMockRunCommand);
});

Deno.test("Test empty tag name", async () => {
  await assertRejects(
    async () => {
      await main("", "fake_sha", mockRunCommand);
    },
    Error,
    "Invalid arguments",
  );
});

Deno.test("Test empty commit SHA", async () => {
  await assertRejects(
    async () => {
      await main("5.5.0", "", mockRunCommand);
    },
    Error,
    "Invalid arguments",
  );
});

Deno.test("Test no valid rc tags found", async () => {
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

Deno.test("An error occurs when the command fails", async () => {
  // deno-lint-ignore require-await
  const customMockRunCommand: RunCommand = async (
    _cmd: string,
    _args: string[],
  ) => {
    throw new Error("Test error");
  };

  await assertRejects(
    async () => {
      await main("5.5.0", "fake_sha", customMockRunCommand);
    },
    Error,
    "Test error",
  );
});

Deno.test("Tag sorting returns the latest tag correctly", () => {
  const tags = ["5.5.0-rc1", "5.5.0-rc10", "5.5.0-rc2"];
  const latest = getLatestRcTag(tags);
  assertEquals(latest, "5.5.0-rc10");
});

Deno.test("Test runCommand with a harmless command", async () => {
  const output = await runCommand("echo", ["Hello"]);
  assertEquals(output.trim(), "Hello");
});

Deno.test("Test runCommand failure case", async () => {
  await assertRejects(
    async () => {
      await runCommand("sh", ["-c", "exit 1"]);
    },
    Error,
    "Command failed:",
  );
});

Deno.test("deleteTagAndReleaseOnError - both deletions succeed", async () => {
  // deno-lint-ignore require-await
  const mockRunCommand: RunCommand = async (cmd: string, args: string[]) => {
    const fullCmd = `${cmd} ${args.join(" ")}`;
    if (fullCmd.startsWith("git push origin --delete")) return "Deleted tag";
    if (fullCmd.startsWith("gh release delete")) return "Deleted release";
    return "";
  };

  await assertRejects(
    async () => {
      await deleteTagAndReleaseOnError(
        "5.5.0",
        "fake_sha",
        new Error("Test error"),
        mockRunCommand,
      );
    },
    Error,
    "Test error",
  );
});

Deno.test("deleteTagAndReleaseOnError - tag deletion fails", async () => {
  // deno-lint-ignore require-await
  const mockRunCommand: RunCommand = async (cmd: string, args: string[]) => {
    const fullCmd = `${cmd} ${args.join(" ")}`;
    if (fullCmd.startsWith("git push origin --delete")) {
      throw new Error("Tag deletion failed");
    }
    if (fullCmd.startsWith("gh release delete")) return "Deleted release";
    return "";
  };

  const originalError = console.error;
  const errorLogs: string[] = [];

  try {
    console.error = (...args: unknown[]) => {
      errorLogs.push(args.join(" "));
    };

    await assertRejects(
      async () => {
        await deleteTagAndReleaseOnError(
          "5.5.0",
          "fake_sha",
          new Error("Test error"),
          mockRunCommand,
        );
      },
      Error,
      "Test error",
    );
  } finally {
    console.error = originalError;
  }

  assertExists(errorLogs.find((log) => log.includes("Tag deletion failed")));
});

Deno.test("deleteTagAndReleaseOnError - release deletion fails", async () => {
  // deno-lint-ignore require-await
  const mockRunCommand: RunCommand = async (cmd: string, args: string[]) => {
    const fullCmd = `${cmd} ${args.join(" ")}`;
    if (fullCmd.startsWith("git push origin --delete")) return "Deleted tag";
    if (fullCmd.startsWith("gh release delete")) {
      throw new Error("Release deletion failed");
    }
    return "";
  };

  const originalError = console.error;
  const errorLogs: string[] = [];

  try {
    console.error = (...args: unknown[]) => {
      errorLogs.push(args.join(" "));
    };

    await assertRejects(
      async () => {
        await deleteTagAndReleaseOnError(
          "5.5.0",
          "fake_sha",
          new Error("Test error"),
          mockRunCommand,
        );
      },
      Error,
      "Test error",
    );
  } finally {
    console.error = originalError;
  }

  assertExists(
    errorLogs.some((log) => log.includes("Release deletion failed")),
  );
});

Deno.test("deleteTagAndReleaseOnError - both deletions fail", async () => {
  // deno-lint-ignore require-await
  const mockRunCommand: RunCommand = async (cmd: string, args: string[]) => {
    const fullCmd = `${cmd} ${args.join(" ")}`;
    if (fullCmd.startsWith("git push origin --delete")) {
      throw new Error("Tag deletion failed");
    }
    if (fullCmd.startsWith("gh release delete")) {
      throw new Error("Release deletion failed");
    }
    return "";
  };

  const originalError = console.error;
  const errorLogs: string[] = [];

  try {
    console.error = (...args: unknown[]) => {
      errorLogs.push(args.join(" "));
    };

    await assertRejects(
      async () => {
        await deleteTagAndReleaseOnError(
          "5.5.0",
          "fake_sha",
          new Error("Test error"),
          mockRunCommand,
        );
      },
      Error,
      "Test error",
    );
  } finally {
    console.error = originalError;
  }

  assertExists(errorLogs.some((log) => log.includes("Tag deletion failed")));
  assertExists(
    errorLogs.some((log) => log.includes("Release deletion failed")),
  );
});
