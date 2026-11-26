// The About page and the header (step 6.2 polish): three links in the bar, no design-system page.
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SiteHeader } from "../components/SiteHeader";
import { About } from "./About";

describe("About page", () => {
  it("explains the project and links to the code, the dataset and the model card", () => {
    vi.stubGlobal("scrollTo", () => {});
    render(<About />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/tested honestly on Indian cities/);
    for (const name of ["The question", "The model", "The data", "What to trust"]) {
      expect(screen.getByRole("heading", { name })).toBeInTheDocument();
    }
    const links = screen.getByRole("list", { name: "Project links" });
    expect(links.querySelectorAll("a")).toHaveLength(3);
    expect(screen.getAllByRole("link", { name: /Model card/ })[0]).toHaveAttribute("href", "https://huggingface.co/viranshul/terrascan-efficientnet-b0-india");
  });

  it("the header has Story, Explorer, Engineering and About, marks the current page, and has no design-system link", () => {
    render(<SiteHeader page="about" />);
    const nav = screen.getByRole("navigation", { name: "Main" });
    expect([...nav.querySelectorAll("a")].map((a) => a.textContent)).toEqual(["Story", "Explorer", "Engineering", "About"]);
    expect(screen.getByRole("link", { name: "About" })).toHaveAttribute("aria-current", "page");
    expect(screen.queryByRole("link", { name: /Design system/ })).toBeNull();
  });
});

describe("Engineering page", () => {
  it("shows the parity and ONNX numbers from story.json, each with its source file", async () => {
    const { Engineering } = await import("./Engineering");
    const story = await import("../../public/data/story.json");
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify(story.default)));
    render(<Engineering />);
    const e = story.default.engineering;
    expect(await screen.findByText(String(e.parity.squares_same_class))).toBeInTheDocument();
    expect(screen.getAllByText(e.onnx.max_abs_logit_difference.toExponential(1)).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: "results/browser_parity.json" }).length).toBeGreaterThan(0);
  });
});
