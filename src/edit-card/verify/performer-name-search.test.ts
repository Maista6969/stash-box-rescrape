// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from "vitest";
import { documentFromHTML } from "../../test/fixtures";

const findPerformerNameMatches = vi.fn();
vi.mock("../../stashbox/graphql", () => ({
  findPerformerNameMatches: (...args: unknown[]) =>
    findPerformerNameMatches(...args),
}));

const { checkPerformerNameMatchesOnPage } =
  await import("./performer-name-search");

afterEach(() => {
  vi.resetAllMocks();
});

function editCardWithBody(): Element {
  const doc = documentFromHTML(`
    <div class="EditCard">
      <div class="card-body">
        <div class="mb-2 row"><b class="col-2 text-end pt-1">Name</b><div class="col-10"><div class="EditDiff">Jane Doe</div></div></div>
      </div>
    </div>
  `);
  return doc.querySelector(".EditCard")!;
}

const janeMatch = {
  id: "p-1",
  name: "Jane Doe",
  disambiguation: "Los Angeles",
  aliases: ["JD"],
  country: "USA",
  birthDate: "1990-01-01",
  imageUrl: "https://example.com/p-1.jpg",
};

describe("checkPerformerNameMatchesOnPage", () => {
  it("does nothing when no card has any names to check", async () => {
    const editCard = editCardWithBody();
    await checkPerformerNameMatchesOnPage([
      { editCard, names: [], ownEntityId: null },
    ]);
    expect(findPerformerNameMatches).not.toHaveBeenCalled();
    expect(editCard.querySelector(".rescrape-name-matches")).toBeNull();
  });

  it("does nothing when no name has a match", async () => {
    findPerformerNameMatches.mockResolvedValue(new Map());
    const editCard = editCardWithBody();

    await checkPerformerNameMatchesOnPage([
      { editCard, names: ["Jane Doe"], ownEntityId: null },
    ]);

    expect(editCard.querySelector(".rescrape-name-matches")).toBeNull();
  });

  it("runs a single query covering every card's names, deduplicated", async () => {
    findPerformerNameMatches.mockResolvedValue(new Map());
    const cardA = editCardWithBody();
    const cardB = editCardWithBody();

    await checkPerformerNameMatchesOnPage([
      { editCard: cardA, names: ["Jane Doe", "JD"], ownEntityId: null },
      { editCard: cardB, names: ["Jane Doe", "Jane D."], ownEntityId: null },
    ]);

    expect(findPerformerNameMatches).toHaveBeenCalledTimes(1);
    expect(findPerformerNameMatches).toHaveBeenCalledWith([
      "Jane Doe",
      "JD",
      "Jane D.",
    ]);
  });

  it("inserts at the top of the card body, ahead of the rest of the submission", async () => {
    findPerformerNameMatches.mockResolvedValue(
      new Map([["Jane Doe", [janeMatch]]]),
    );
    const editCard = editCardWithBody();

    await checkPerformerNameMatchesOnPage([
      { editCard, names: ["Jane Doe"], ownEntityId: null },
    ]);

    const cardBody = editCard.querySelector(".card-body")!;
    expect(cardBody.firstElementChild?.className).toBe("rescrape-name-matches");
  });

  it("shows a single match directly, without an expandable details wrapper", async () => {
    findPerformerNameMatches.mockResolvedValue(
      new Map([["Jane Doe", [janeMatch]]]),
    );
    const editCard = editCardWithBody();

    await checkPerformerNameMatchesOnPage([
      { editCard, names: ["Jane Doe"], ownEntityId: null },
    ]);

    expect(editCard.querySelector("details.rescrape-name-matches")).toBeNull();

    const notice = editCard.querySelector("div.rescrape-name-matches");
    expect(notice).not.toBeNull();

    const heading = notice?.querySelector(".rescrape-name-match-heading");
    expect(heading?.textContent).toBe(
      "Performer with a matching name - please check this isn't the same person",
    );

    const link = notice?.querySelector("a");
    expect(link?.textContent).toBe("Jane Doe (Los Angeles)");
    expect(link?.getAttribute("href")).toContain("/performers/p-1");

    const meta = notice?.querySelector(".rescrape-name-match-meta");
    expect(meta?.textContent).toBe("USA • 1990-01-01 • aka JD");

    const thumb = notice?.querySelector("img.rescrape-name-match-thumb");
    expect(thumb?.getAttribute("src")).toBe("https://example.com/p-1.jpg");

    const commentIcon = notice?.querySelector(".rescrape-icon");
    expect(commentIcon?.querySelector("title")?.textContent).toBe(
      `Add comment: "Already exists as [Jane Doe (Los Angeles)](${window.location.origin}/performers/p-1)"`,
    );
  });

  it("highlights the candidate's own name inline when the search matched via their primary name", async () => {
    findPerformerNameMatches.mockResolvedValue(
      new Map([["Jane Doe", [janeMatch]]]),
    );
    const editCard = editCardWithBody();

    await checkPerformerNameMatchesOnPage([
      { editCard, names: ["Jane Doe"], ownEntityId: null },
    ]);

    const link = editCard.querySelector("a.rescrape-name-match-name")!;
    expect(link.classList.contains("rescrape-name-match-hint")).toBe(true);

    const akaHint = editCard.querySelector(
      ".rescrape-name-match-meta .rescrape-name-match-hint",
    );
    expect(akaHint).toBeNull();
  });

  it("highlights the matching alias inline, not the primary name, when the search matched via an alias", async () => {
    findPerformerNameMatches.mockResolvedValue(new Map([["JD", [janeMatch]]]));
    const editCard = editCardWithBody();

    await checkPerformerNameMatchesOnPage([
      { editCard, names: ["JD"], ownEntityId: null },
    ]);

    const link = editCard.querySelector("a.rescrape-name-match-name")!;
    expect(link.classList.contains("rescrape-name-match-hint")).toBe(false);

    const akaHint = editCard.querySelector(
      ".rescrape-name-match-meta .rescrape-name-match-hint",
    );
    expect(akaHint?.textContent).toBe("JD");
  });

  it("dedupes a performer matched via more than one submitted name into a single item, highlighting every matched term", async () => {
    findPerformerNameMatches.mockResolvedValue(
      new Map([
        ["Jane Doe", [janeMatch]],
        ["JD", [janeMatch]],
      ]),
    );
    const editCard = editCardWithBody();

    await checkPerformerNameMatchesOnPage([
      { editCard, names: ["Jane Doe", "JD"], ownEntityId: null },
    ]);

    expect(editCard.querySelectorAll(".rescrape-name-match-item")).toHaveLength(
      1,
    );

    const link = editCard.querySelector("a.rescrape-name-match-name")!;
    expect(link.classList.contains("rescrape-name-match-hint")).toBe(true);

    const akaHint = editCard.querySelector(
      ".rescrape-name-match-meta .rescrape-name-match-hint",
    );
    expect(akaHint?.textContent).toBe("JD");
  });

  it("wraps multiple distinct matches in a collapsed details element with a generic plural header", async () => {
    findPerformerNameMatches.mockResolvedValue(
      new Map([
        ["Jane Doe", [janeMatch]],
        [
          "JD",
          [
            {
              id: "p-2",
              name: "Jane Dawson",
              disambiguation: null,
              aliases: ["JD"],
              country: null,
              birthDate: null,
              imageUrl: null,
            },
          ],
        ],
      ]),
    );
    const editCard = editCardWithBody();

    await checkPerformerNameMatchesOnPage([
      { editCard, names: ["Jane Doe", "JD"], ownEntityId: null },
    ]);

    const details = editCard.querySelector("details.rescrape-name-matches");
    expect(details).not.toBeNull();
    expect(details?.hasAttribute("open")).toBe(false);

    const summary = details?.querySelector("summary");
    expect(summary?.textContent).toBe(
      "Performers with matching names (2) - please check these aren't the same person",
    );

    expect(details!.querySelectorAll(".rescrape-name-match-item")).toHaveLength(
      2,
    );
  });

  it("omits the thumbnail when there's no image", async () => {
    findPerformerNameMatches.mockResolvedValue(
      new Map([
        [
          "Jane Doe",
          [
            {
              id: "p-1",
              name: "Jane Doe",
              disambiguation: null,
              aliases: [],
              country: null,
              birthDate: null,
              imageUrl: null,
            },
          ],
        ],
      ]),
    );
    const editCard = editCardWithBody();

    await checkPerformerNameMatchesOnPage([
      { editCard, names: ["Jane Doe"], ownEntityId: null },
    ]);

    expect(editCard.querySelector("img.rescrape-name-match-thumb")).toBeNull();
  });

  it("does not flag a match that's the performer this very edit created", async () => {
    findPerformerNameMatches.mockResolvedValue(
      new Map([
        [
          "Jane Doe",
          [
            {
              id: "self-id",
              name: "Jane Doe",
              disambiguation: null,
              aliases: [],
              country: null,
              birthDate: null,
              imageUrl: null,
            },
          ],
        ],
      ]),
    );
    const editCard = editCardWithBody();

    await checkPerformerNameMatchesOnPage([
      { editCard, names: ["Jane Doe"], ownEntityId: "self-id" },
    ]);

    expect(editCard.querySelector(".rescrape-name-matches")).toBeNull();
  });

  it("logs and does not throw when the search query fails", async () => {
    findPerformerNameMatches.mockRejectedValue(new Error("network error"));
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const editCard = editCardWithBody();

    await checkPerformerNameMatchesOnPage([
      { editCard, names: ["Jane Doe"], ownEntityId: null },
    ]);

    expect(editCard.querySelector(".rescrape-name-matches")).toBeNull();
    expect(warnSpy).toHaveBeenCalled();
  });
});
