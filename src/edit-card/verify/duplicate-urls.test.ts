// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from "vitest";
import { documentFromHTML } from "../../test/fixtures";

const findDuplicatesByUrl = vi.fn();
vi.mock("../../stashbox/graphql", () => ({
  findDuplicatesByUrl: (...args: unknown[]) => findDuplicatesByUrl(...args),
}));

const { checkForDuplicateUrlsOnPage } = await import("./duplicate-urls");

afterEach(() => {
  vi.resetAllMocks();
});

function editCardWithBody(): Element {
  const doc = documentFromHTML(`
    <div class="EditCard">
      <div class="card-body">
        <div class="mb-2 row"><b class="col-2 text-end pt-1">Title</b><div class="col-10"><div class="EditDiff">Some Title</div></div></div>
      </div>
    </div>
  `);
  return doc.querySelector(".EditCard")!;
}

describe("checkForDuplicateUrlsOnPage", () => {
  it("does nothing when no card has any URLs to check", async () => {
    const editCard = editCardWithBody();
    await checkForDuplicateUrlsOnPage([
      { editCard, urls: [], ownEntityId: null },
    ]);
    expect(findDuplicatesByUrl).not.toHaveBeenCalled();
    expect(editCard.querySelector(".rescrape-duplicate-warning")).toBeNull();
  });

  it("does nothing when no URL has a match", async () => {
    findDuplicatesByUrl.mockResolvedValue(new Map());
    const editCard = editCardWithBody();

    await checkForDuplicateUrlsOnPage([
      { editCard, urls: ["https://example.com/a"], ownEntityId: null },
    ]);

    expect(editCard.querySelector(".rescrape-duplicate-warning")).toBeNull();
  });

  it("runs a single query covering every card's URLs, deduplicated", async () => {
    findDuplicatesByUrl.mockResolvedValue(new Map());
    const cardA = editCardWithBody();
    const cardB = editCardWithBody();

    await checkForDuplicateUrlsOnPage([
      {
        editCard: cardA,
        urls: ["https://example.com/a", "https://shared.com"],
        ownEntityId: null,
      },
      {
        editCard: cardB,
        urls: ["https://example.com/b", "https://shared.com"],
        ownEntityId: null,
      },
    ]);

    expect(findDuplicatesByUrl).toHaveBeenCalledTimes(1);
    expect(findDuplicatesByUrl).toHaveBeenCalledWith([
      "https://example.com/a",
      "https://shared.com",
      "https://example.com/b",
    ]);
  });

  it("inserts a warning at the top of the card body listing the matched performer/scene", async () => {
    findDuplicatesByUrl.mockResolvedValue(
      new Map([
        [
          "https://example.com/a",
          [{ type: "performer", id: "p-1", name: "Jane Doe" }],
        ],
      ]),
    );
    const editCard = editCardWithBody();

    await checkForDuplicateUrlsOnPage([
      { editCard, urls: ["https://example.com/a"], ownEntityId: null },
    ]);

    const cardBody = editCard.querySelector(".card-body")!;
    const warning = cardBody.firstElementChild;
    expect(warning?.className).toBe("rescrape-duplicate-warning");
    expect(warning?.textContent).toContain(
      "Possible duplicate: matching URL found elsewhere",
    );

    const link = warning?.querySelector("a");
    expect(link?.textContent).toBe("Jane Doe");
    expect(link?.getAttribute("href")).toContain("/performers/p-1");
  });

  it("only flags the card whose own URL matched, not every card in the batch", async () => {
    findDuplicatesByUrl.mockResolvedValue(
      new Map([
        [
          "https://example.com/a",
          [{ type: "performer", id: "p-1", name: "Jane Doe" }],
        ],
      ]),
    );
    const cardA = editCardWithBody();
    const cardB = editCardWithBody();

    await checkForDuplicateUrlsOnPage([
      { editCard: cardA, urls: ["https://example.com/a"], ownEntityId: null },
      { editCard: cardB, urls: ["https://example.com/b"], ownEntityId: null },
    ]);

    expect(cardA.querySelector(".rescrape-duplicate-warning")).not.toBeNull();
    expect(cardB.querySelector(".rescrape-duplicate-warning")).toBeNull();
  });

  it("does not flag a match that's the entity this very edit created", async () => {
    findDuplicatesByUrl.mockResolvedValue(
      new Map([
        [
          "https://example.com/a",
          [{ type: "scene", id: "self-id", name: "This Scene" }],
        ],
      ]),
    );
    const editCard = editCardWithBody();

    await checkForDuplicateUrlsOnPage([
      {
        editCard,
        urls: ["https://example.com/a"],
        ownEntityId: "self-id",
      },
    ]);

    expect(editCard.querySelector(".rescrape-duplicate-warning")).toBeNull();
  });

  it("still flags other matches on the same URL when only one is the edit's own entity", async () => {
    findDuplicatesByUrl.mockResolvedValue(
      new Map([
        [
          "https://example.com/a",
          [
            { type: "scene", id: "self-id", name: "This Scene" },
            { type: "scene", id: "other-id", name: "Another Scene" },
          ],
        ],
      ]),
    );
    const editCard = editCardWithBody();

    await checkForDuplicateUrlsOnPage([
      {
        editCard,
        urls: ["https://example.com/a"],
        ownEntityId: "self-id",
      },
    ]);

    const warning = editCard.querySelector(".rescrape-duplicate-warning");
    expect(warning).not.toBeNull();
    expect(warning?.textContent).toContain("Another Scene");
    expect(warning?.textContent).not.toContain("This Scene");
  });

  it("logs and does not throw when the search query fails", async () => {
    findDuplicatesByUrl.mockRejectedValue(new Error("network error"));
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const editCard = editCardWithBody();

    await checkForDuplicateUrlsOnPage([
      { editCard, urls: ["https://example.com/a"], ownEntityId: null },
    ]);

    expect(editCard.querySelector(".rescrape-duplicate-warning")).toBeNull();
    expect(warnSpy).toHaveBeenCalled();
  });
});
