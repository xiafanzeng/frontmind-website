// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { EnterpriseAnalysis } from "./GeoBuildExperience";
import { createGeoStylePreviewProject } from "./preview";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("enterprise knowledge browser", () => {
  it("returns the knowledge document to its first screen when branches change", () => {
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      callback(0);
      return 1;
    });
    const view = render(
      <EnterpriseAnalysis
        project={createGeoStylePreviewProject()}
        onDownload={vi.fn()}
        onContact={vi.fn()}
        onStart={vi.fn()}
        starting={false}
      />,
    );
    const documentPanel = view.container.querySelector(
      ".geo-knowledge-document",
    ) as HTMLElement;
    documentPanel.scrollTop = 240;

    fireEvent.click(screen.getByRole("button", { name: /团队与组织/ }));

    expect(documentPanel.scrollTop).toBe(0);
  });
});
