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

  it("the header has Story, Explorer and About, marks the current page, and has no design-system link", () => {
    render(<SiteHeader page="about" />);
    const nav = screen.getByRole("navigation", { name: "Main" });
    expect([...nav.querySelectorAll("a")].map((a) => a.textContent)).toEqual(["Story", "Explorer", "About"]);
    expect(screen.getByRole("link", { name: "About" })).toHaveAttribute("aria-current", "page");
    expect(screen.queryByRole("link", { name: /Design system/ })).toBeNull();
  });
});
