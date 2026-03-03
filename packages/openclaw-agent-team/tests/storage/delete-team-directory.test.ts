import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdir, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { deleteTeamDirectory, createTeamDirectory, teamDirectoryExists } from "../../src/storage.js";

describe("deleteTeamDirectory", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = join(process.cwd(), "test-temp", `delete-team-test-${Date.now()}`);
    await mkdir(tempDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(join(process.cwd(), "test-temp"), { recursive: true, force: true });
  });

  describe("Given an existing team directory with files and subdirectories", () => {
    it("When deleteTeamDirectory is called, Then the entire directory is removed recursively", async () => {
      // Given
      const teamName = "test-team";
      await createTeamDirectory(tempDir, teamName);

      // Add nested content to verify recursive deletion
      const nestedDir = join(tempDir, teamName, "agents", "researcher", "workspace");
      await mkdir(nestedDir, { recursive: true });
      await writeFile(join(nestedDir, "file.txt"), "test content");

      // Verify directory exists before deletion
      expect(await teamDirectoryExists(tempDir, teamName)).toBe(true);

      // When
      await deleteTeamDirectory(tempDir, teamName);

      // Then
      expect(await teamDirectoryExists(tempDir, teamName)).toBe(false);

      // Verify the entire directory is gone
      await expect(stat(join(tempDir, teamName))).rejects.toThrow();
    });
  });

  describe("Given a non-existent team directory", () => {
    it("When deleteTeamDirectory is called, Then it completes without error", async () => {
      // Given - non-existent team
      const teamName = "non-existent-team";

      // When/Then - should not throw
      await expect(deleteTeamDirectory(tempDir, teamName)).resolves.not.toThrow();
    });
  });

  describe("Given an invalid team name with path traversal characters", () => {
    it("When deleteTeamDirectory is called with '../escape', Then it throws an error", async () => {
      // Given
      const maliciousName = "../escape";

      // When/Then
      await expect(deleteTeamDirectory(tempDir, maliciousName)).rejects.toThrow(/invalid team name/i);
    });

    it("When deleteTeamDirectory is called with '..' only, Then it throws an error", async () => {
      // Given
      const maliciousName = "..";

      // When/Then
      await expect(deleteTeamDirectory(tempDir, maliciousName)).rejects.toThrow(/invalid team name/i);
    });

    it("When deleteTeamDirectory is called with path containing slashes, Then it throws an error", async () => {
      // Given
      const maliciousName = "foo/../../../escape";

      // When/Then
      await expect(deleteTeamDirectory(tempDir, maliciousName)).rejects.toThrow(/invalid team name/i);
    });
  });

  describe("Given a valid team name", () => {
    it("When deleteTeamDirectory is called, Then only that team directory is deleted (not siblings)", async () => {
      // Given - create two teams
      const teamName1 = "team-to-delete";
      const teamName2 = "team-to-keep";
      await createTeamDirectory(tempDir, teamName1);
      await createTeamDirectory(tempDir, teamName2);

      // When
      await deleteTeamDirectory(tempDir, teamName1);

      // Then
      expect(await teamDirectoryExists(tempDir, teamName1)).toBe(false);
      expect(await teamDirectoryExists(tempDir, teamName2)).toBe(true);
    });
  });
});
