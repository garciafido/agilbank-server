import { buildProjectionRows, PathSeg, DisplayPart } from "../projectionHelper";

const root = {
  works: [
    {
      authors: [
        {
          author: { id: "au1", firstName: "Ana", lastName: "García" },
          publishers: [
            { publisher: { id: "p1", pseudonym: "Editorial Uno" } },
            { publisher: { id: "p2", pseudonym: "Editorial Dos" } },
          ],
        },
        {
          author: { id: "au1", firstName: "Ana", lastName: "García" }, // dup author
          publishers: [
            { publisher: { id: "p1", pseudonym: "Editorial Uno" } }, // dup publisher
          ],
        },
      ],
    },
  ],
};

const publisherSegs: PathSeg[] = [
  { key: "works", isArray: true },
  { key: "authors", isArray: true },
  { key: "publishers", isArray: true },
  { key: "publisher", isArray: false },
];
const publisherParts: DisplayPart[] = [{ field: "pseudonym" }];

const authorSegs: PathSeg[] = [
  { key: "works", isArray: true },
  { key: "authors", isArray: true },
  { key: "author", isArray: false },
];
const authorParts: DisplayPart[] = [
  { field: "firstName" },
  { literal: " " },
  { field: "lastName" },
];

describe("buildProjectionRows", () => {
  it("des-anida y deduplica publishers por id", () => {
    const rows = buildProjectionRows(root, publisherSegs, publisherParts);
    expect(rows).toEqual([
      { sourceKey: "p1", displayLabel: "Editorial Uno" },
      { sourceKey: "p2", displayLabel: "Editorial Dos" },
    ]);
  });

  it("renderiza displayId compuesto y deduplica authors por id", () => {
    const rows = buildProjectionRows(root, authorSegs, authorParts);
    expect(rows).toEqual([{ sourceKey: "au1", displayLabel: "Ana García" }]);
  });

  it("tolera arrays ausentes y objetos null", () => {
    expect(buildProjectionRows({}, publisherSegs, publisherParts)).toEqual([]);
    expect(buildProjectionRows({ works: [{}] }, publisherSegs, publisherParts)).toEqual([]);
  });

  it("descarta terminales sin id string", () => {
    const r = { works: [{ authors: [{ author: { firstName: "X" } }] }] };
    expect(buildProjectionRows(r, authorSegs, authorParts)).toEqual([]);
  });
});
