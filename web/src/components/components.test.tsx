// Tests for the design-system components (step 5.3a). No network: every value is passed in directly.
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Button } from "./Button";
import { Legend } from "./Legend";
import { Slider } from "./Slider";
import { Stat } from "./Stat";
import { Segmented, Switch } from "./Toggle";
import { fireEvent } from "@testing-library/react";
import { media } from "../test/setup";

describe("Button", () => {
  it("is a link when it has an href, a button otherwise", () => {
    render(<><Button href="/explorer">Open</Button><Button onClick={() => {}}>Go</Button></>);
    expect(screen.getByRole("link", { name: "Open" })).toHaveAttribute("href", "/explorer");
    expect(screen.getByRole("button", { name: "Go" })).toHaveAttribute("type", "button");
  });

  it("calls onClick", async () => {
    const click = vi.fn();
    render(<Button onClick={click}>Go</Button>);
    await userEvent.click(screen.getByRole("button", { name: "Go" }));
    expect(click).toHaveBeenCalledOnce();
  });
});

describe("Switch", () => {
  it("reports the next state, by mouse and by keyboard", async () => {
    const change = vi.fn();
    render(<Switch label="Changes only" checked={false} onChange={change} />);
    const sw = screen.getByRole("switch", { name: "Changes only" });
    expect(sw).toHaveAttribute("aria-checked", "false");
    await userEvent.click(sw);
    expect(change).toHaveBeenLastCalledWith(true);
    sw.focus();
    await userEvent.keyboard(" ");
    expect(change).toHaveBeenCalledTimes(2);
  });
});

describe("Segmented", () => {
  it("marks the chosen option and reports a new choice", async () => {
    const change = vi.fn();
    render(<Segmented label="Year" value="2026" onChange={change} options={[{ value: "2018", label: "2018" }, { value: "2026", label: "2026" }]} />);
    expect(screen.getByRole("button", { name: "2026" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "2018" })).toHaveAttribute("aria-pressed", "false");
    await userEvent.click(screen.getByRole("button", { name: "2018" }));
    expect(change).toHaveBeenCalledWith("2018");
  });
});

describe("Slider", () => {
  it("shows its value and reports changes as numbers", () => {
    const change = vi.fn();
    render(<Slider label="Opacity" value={60} onChange={change} format={(v) => `${v}%`} />);
    const range = screen.getByLabelText("Opacity");
    expect(screen.getByText("60%")).toBeInTheDocument();
    fireEvent.change(range, { target: { value: "35" } });
    expect(change).toHaveBeenCalledWith(35);
  });
});

describe("Legend", () => {
  const items = [
    { key: "AnnualCrop", colour: "#e6c84a", value: 128, delta: -94 },
    { key: "Forest", colour: "#1b7837", value: 2, delta: 1 },
  ];

  it("shows the plain name, and the original name only when it differs", () => {
    render(<Legend items={items} format={String} />);
    expect(screen.getByText("Farmland")).toBeInTheDocument();
    expect(screen.getByTitle("Model class: AnnualCrop")).toBeInTheDocument();
    expect(screen.getAllByText("Forest")).toHaveLength(1);
    expect(screen.getByText("−94")).toBeInTheDocument();
  });

  it("filters on click and previews on pointing", async () => {
    const toggle = vi.fn(), preview = vi.fn();
    render(<Legend items={items} format={String} active={["Forest"]} onToggle={toggle} onPreview={preview} />);
    const farm = screen.getByRole("button", { name: /Farmland/ });
    expect(farm).toHaveAttribute("aria-pressed", "false");
    await userEvent.hover(farm);
    expect(preview).toHaveBeenCalledWith("AnnualCrop");
    await userEvent.click(farm);
    expect(toggle).toHaveBeenCalledWith("AnnualCrop");
  });
});

describe("Stat", () => {
  const source = { file: "web/public/data/ahmedabad/summary.json", field: "changed_km2", note: "Reported by the model." };

  it("shows the final value at once with reduced motion", () => {
    render(<Stat value={319.4} unit="km²" label="flagged as changed" source={source} />);
    expect(screen.getAllByText("319").length).toBeGreaterThan(0);
    expect(screen.getByText("flagged as changed")).toBeInTheDocument();
  });

  it("with motion on, counts from 0 while its box already holds the final value", () => {
    media.reduce = false;
    try {
      const { container } = render(<Stat value={319} label="flagged" source={source} />);
      expect(container.querySelector(".stat-ghost")).toHaveTextContent("319");
      expect(container.querySelector(".stat-live")).toHaveTextContent("0");
    } finally {
      media.reduce = true;
    }
  });

  it("opens and closes its source note", async () => {
    render(<Stat value={319} label="flagged" source={source} />);
    const btn = screen.getByRole("button", { name: "Source" });
    await userEvent.click(btn);
    expect(btn).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("dialog")).toHaveTextContent("summary.json");
    expect(screen.getByRole("dialog")).toHaveTextContent("changed_km2");
    await userEvent.keyboard("{Escape}");
    expect(btn).toHaveAttribute("aria-expanded", "false");
  });
});
