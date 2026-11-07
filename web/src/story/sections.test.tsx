// Tests for the sections under the Story map (step 5.3c part 2): model cards, the game, How it works, the footer.
// Made-up numbers, so finding them on screen proves they came from the data. No network: the game's play part is
// rendered directly with a fake picture.
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SiteFooter } from "../components/SiteFooter";
import { blockOrder } from "../lib/pixelSwap";
import { compareAccuracy, ourModel, type ModelResult, type StoryData } from "../lib/story";
import type { Index } from "../lib/types";
import { options, verdictText } from "./Game";
import { HowItWorks } from "./HowItWorks";
import { barLength, Models, verdict } from "./Models";

const model = (name: string, mean: number, std: number, ms: number, params: number, seeds = [42, 43, 44]): ModelResult =>
  ({ name, source: `results/${name}.json`, seeds, image_size: 64, params, accuracy: { mean, std }, cpu_ms_per_image: { mean: ms, std: 0 } });
const ITEMS = [
  model("small_cnn_v1", 0.9111, 0, 1.5, 100000, [42]),
  model("small_cnn_v2", 0.9561, 0.002, 9.25, 1200000),
  model("resnet18", 0.9444, 0.001, 13.76, 11000000),
  model("efficientnet_b0", 0.9566, 0.002, 6.5, 4000000),
];
const STORY = {
  made_by: "test",
  ahmedabad: { source: "results/change_check.json", n_pairs: 37 },
  india: { source: "results/india_after.json", n_finetune_patches: 321 },
  models: { note: "Test note.", items: ITEMS },
} as unknown as StoryData;
const INDEX = { years: ["2018", "2026"], classes: Array.from({ length: 7 }, (_, i) => ({ name: `C${i}`, colour: "#000" })), cities: [], model: "" } as Index;

describe("model comparison", () => {
  it("compares accuracy ranges (mean ± std); overlap = about the same", () => {
    expect(compareAccuracy(ITEMS[1], ITEMS[3])).toBe("same");
    expect(compareAccuracy(ITEMS[1], ITEMS[2])).toBe("higher");
    expect(compareAccuracy(ITEMS[2], ITEMS[1])).toBe("lower");
  });

  it("our model is the best from-scratch model with several seeds (not the one-seed first try)", () => {
    expect(ourModel(ITEMS)?.name).toBe("small_cnn_v2");
  });

  it("the sentence is built from the comparison, never stated by hand", () => {
    expect(verdict(ITEMS)?.text).toBe("Small CNN, trained from scratch, is about as accurate as EfficientNet-B0 and more accurate than ResNet-18. It is not the fastest: EfficientNet-B0 runs faster on a laptop CPU.");
  });

  it("bars: speed and size relative to the largest; accuracy from just below the lowest range", () => {
    expect(barLength(ITEMS, "speed").len(ITEMS[2])).toBe(1);
    expect(barLength(ITEMS, "size").len(ITEMS[0])).toBeCloseTo(100000 / 11000000);
    const acc = barLength(ITEMS, "accuracy");
    expect(acc.from).toBe(0.9);
    expect(acc.len(ITEMS[3])).toBeCloseTo((0.9566 - 0.9) / 0.1);
  });

  it("cards show the chosen measure from the data", async () => {
    render(<Models story={STORY} />);
    expect(screen.getAllByText("95.6").length).toBeGreaterThan(0); // small_cnn_v2 accuracy, in its big number
    expect(screen.getByText("1 seed")).toBeInTheDocument(); // a one-run model shows no fake "± 0"
    expect(screen.getAllByText("± 0.20").length).toBeGreaterThan(0);
    await userEvent.click(screen.getByRole("button", { name: "Speed" }));
    expect(screen.getByRole("button", { name: "Speed" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getAllByText("13.8").length).toBeGreaterThan(0); // resnet18 ms
    expect(screen.getByText(/Test note\./)).toBeInTheDocument();
    expect(within(screen.getByText("Ours").closest("article")!).getByText("Small CNN")).toBeInTheDocument();
  });
});

describe("the game", () => {
  const q = { i: 0, area: "a", label: "River", model: "Forest", confidence: 0.8 };
  it("always offers the right answer and the model's answer, four choices in all", () => {
    for (let n = 0; n < 20; n++) {
      const o = options(q, ["River", "Forest", "Pasture", "Industrial", "Highway", "SeaLake"]);
      expect(o).toHaveLength(4);
      expect(o).toEqual(expect.arrayContaining(["River", "Forest"]));
      expect(new Set(o).size).toBe(4);
    }
  });

  it("says who won", () => {
    expect(verdictText(3, 2)).toBe("You beat the model.");
    expect(verdictText(2, 2)).toBe("A draw.");
    expect(verdictText(1, 4)).toBe("The model wins this time.");
  });
});

describe("pixelSwap order", () => {
  it("visits every block once, the same way every time for a seed", () => {
    const a = blockOrder(48, 7);
    expect([...a].sort((x, y) => x - y)).toEqual([...Array(48).keys()]);
    expect(blockOrder(48, 7)).toEqual(a);
    expect(blockOrder(48, 8)).not.toEqual(a);
  });
});

describe("How it works and the footer", () => {
  it("steps read their numbers from the data; unfinished links are not links", () => {
    render(<HowItWorks index={INDEX} story={STORY} />);
    expect(screen.getByText(/one of 7 land-use classes/)).toBeInTheDocument();
    expect(screen.getAllByText(/321/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/37/).length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: /Source code/ })).toHaveAttribute("href", "https://github.com/Viranshul-P/terrascan");
    expect(screen.queryByRole("link", { name: /Model card/ })).toBeNull();
    expect(screen.queryByRole("link", { name: /Blog post/ })).toBeNull();
  });

  it("the footer says plainly that an AI assistant helped", () => {
    vi.stubGlobal("scrollTo", () => {});
    render(<SiteFooter />);
    expect(screen.getByText(/made with Claude, an AI assistant/)).toBeInTheDocument();
  });
});
