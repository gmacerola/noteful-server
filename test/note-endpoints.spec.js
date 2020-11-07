const knex = require("knex");
const app = require("../src/app");
const { makeNoteArray, makeMaliciousNote } = require("./note.fixtures");

describe("Note Endpoints", function () {
  let db;

  before("make knex instance", () => {
    db = knex({
      client: "pg",
      connection: process.env.TEST_DATABASE_URL,
    });
    app.set("db", db);
  });

  after("disconnect from db", () => db.destroy());

  before("clean the table", () =>
    db.raw("TRUNCATE note RESTART IDENTITY CASCADE")
  );

  afterEach("cleanup", () => db.raw("TRUNCATE note RESTART IDENTITY CASCADE"));

  describe(`GET /api/notes`, () => {
    context(`Given no notes`, () => {
      it(`responds with 200 and an empty list`, () => {
        return supertest(app).get("/api/notes").expect(200, []);
      });
    });

    context("Given there are notes in the database", () => {
      const testNotes = makeNoteArray();

      beforeEach("insert note", () => {
        return db.into("note").then(() => {
          return db.into("note").insert(testNotes);
        });
      });

      it("responds with 200 and all of the notes", () => {
        return supertest(app).get("/api/notes").expect(200, testNotes);
      });
    });

    context(`Given an XSS attack note`, () => {
      const { maliciousNote, expectedNote } = makeMaliciousNote();

      beforeEach("insert malicious note", () => {
        return db.into("note").then(() => {
          return db.into("note").insert([maliciousNote]);
        });
      });

      it("removes XSS attack content", () => {
        return supertest(app)
          .get(`/api/notes`)
          .expect(200)
          .expect((res) => {
            expect(res.body[0].title).to.eql(expectedNote.title);
            expect(res.body[0].content).to.eql(expectedNote.content);
          });
      });
    });
  });

  describe(`GET /api/notes/:note_id`, () => {
    context(`Given no notes`, () => {
      it(`responds with 404`, () => {
        const noteId = 123456;
        return supertest(app)
          .get(`/api/notes/${noteId}`)
          .expect(404, { error: { message: `Note doesn't exist` } });
      });
    });

    context("Given there are notes in the database", () => {
      const testNotes = makeNoteArray();

      beforeEach("insert notes", () => {
        return db.into("blogful_users").then(() => {
          return db.into("note").insert(testNotes);
        });
      });

      it("responds with 200 and the specified note", () => {
        const noteId = 2;
        const expectedNote = testNotes[noteId - 1];
        return supertest(app)
          .get(`/api/notes/${noteId}`)
          .expect(200, expectedNote);
      });
    });

    context(`Given an XSS attack note`, () => {
      const { maliciousNote, expectedNote } = makeMaliciousNote();

      beforeEach("insert malicious note", () => {
        return db.into("blogful_users").then(() => {
          return db.into("note").insert([maliciousNote]);
        });
      });

      it("removes XSS attack content", () => {
        return supertest(app)
          .get(`/api/notes/${maliciousNote.id}`)
          .expect(200)
          .expect((res) => {
            expect(res.body.title).to.eql(expectedNote.title);
            expect(res.body.content).to.eql(expectedNote.content);
          });
      });
    });
  });

  describe(`POST /api/notes`, () => {
    const testUsers = makeUsersArray();
    beforeEach("insert malicious article", () => {
      return db.into("blogful_users").insert(testUsers);
    });

    it(`creates an article, responding with 201 and the new article`, function () {
      this.retries(3);
      const newArticle = {
        title: "Test new article",
        style: "Listicle",
        content: "Test new article content...",
      };
      return supertest(app)
        .post("/api/articles")
        .send(newArticle)
        .expect(201)
        .expect((res) => {
          expect(res.body.title).to.eql(newArticle.title);
          expect(res.body.style).to.eql(newArticle.style);
          expect(res.body.content).to.eql(newArticle.content);
          expect(res.body).to.have.property("id");
          expect(res.headers.location).to.eql(`/api/articles/${res.body.id}`);
          const expected = new Date().toLocaleString();
          const actual = new Date(res.body.date_published).toLocaleString();
          expect(actual).to.eql(expected);
        })
        .then((res) =>
          supertest(app).get(`/api/articles/${res.body.id}`).expect(res.body)
        );
    });

    const requiredFields = ["title", "style", "content"];

    requiredFields.forEach((field) => {
      const newArticle = {
        title: "Test new article",
        style: "Listicle",
        content: "Test new article content...",
      };

      it(`responds with 400 and an error message when the '${field}' is missing`, () => {
        delete newArticle[field];

        return supertest(app)
          .post("/api/articles")
          .send(newArticle)
          .expect(400, {
            error: { message: `Missing '${field}' in request body` },
          });
      });
    });

    it("removes XSS attack content from response", () => {
      const { maliciousArticle, expectedArticle } = makeMaliciousArticle();
      return supertest(app)
        .post(`/api/articles`)
        .send(maliciousArticle)
        .expect(201)
        .expect((res) => {
          expect(res.body.title).to.eql(expectedArticle.title);
          expect(res.body.content).to.eql(expectedArticle.content);
        });
    });
  });

  describe(`DELETE /api/articles/:article_id`, () => {
    context(`Given no articles`, () => {
      it(`responds with 404`, () => {
        const articleId = 123456;
        return supertest(app)
          .delete(`/api/articles/${articleId}`)
          .expect(404, { error: { message: `Article doesn't exist` } });
      });
    });

    context("Given there are articles in the database", () => {
      const testUsers = makeUsersArray();
      const testArticles = makeArticlesArray();

      beforeEach("insert articles", () => {
        return db
          .into("blogful_users")
          .insert(testUsers)
          .then(() => {
            return db.into("blogful_articles").insert(testArticles);
          });
      });

      it("responds with 204 and removes the article", () => {
        const idToRemove = 2;
        const expectedArticles = testArticles.filter(
          (article) => article.id !== idToRemove
        );
        return supertest(app)
          .delete(`/api/articles/${idToRemove}`)
          .expect(204)
          .then((res) =>
            supertest(app).get(`/api/articles`).expect(expectedArticles)
          );
      });
    });
  });

  describe.only(`PATCH /api/articles/:article_id`, () => {
    context(`Given no articles`, () => {
      it(`responds with 404`, () => {
        const articleId = 123456;
        return supertest(app)
          .patch(`/api/articles/${articleId}`)
          .expect(404, { error: { message: `Article doesn't exist` } });
      });
    });

    context("Given there are articles in the database", () => {
      const testUsers = makeUsersArray();
      const testArticles = makeArticlesArray();

      beforeEach("insert articles", () => {
        return db
          .into("blogful_users")
          .insert(testUsers)
          .then(() => {
            return db.into("blogful_articles").insert(testArticles);
          });
      });

      it("responds with 204 and updates the article", () => {
        const idToUpdate = 2;
        const updateArticle = {
          title: "updated article title",
          style: "Interview",
          content: "updated article content",
        };
        const expectedArticle = {
          ...testArticles[idToUpdate - 1],
          ...updateArticle,
        };
        return supertest(app)
          .patch(`/api/articles/${idToUpdate}`)
          .send(updateArticle)
          .expect(204)
          .then((res) =>
            supertest(app)
              .get(`/api/articles/${idToUpdate}`)
              .expect(expectedArticle)
          );
      });

      it(`responds with 400 when no required fields supplied`, () => {
        const idToUpdate = 2;
        return supertest(app)
          .patch(`/api/articles/${idToUpdate}`)
          .send({ irrelevantField: "foo" })
          .expect(400, {
            error: {
              message: `Request body must contain either 'title', 'style' or 'content'`,
            },
          });
      });
      it(`responds with 204 when updating only a subset of fields`, () => {
        const idToUpdate = 2;
        const updateArticle = {
          title: "updated article title",
        };
        const expectedArticle = {
          ...testArticles[idToUpdate - 1],
          ...updateArticle,
        };

        return supertest(app)
          .patch(`/api/articles/${idToUpdate}`)
          .send({
            ...updateArticle,
            fieldToIgnore: "should not be in GET response",
          })
          .expect(204)
          .then((res) =>
            supertest(app)
              .get(`/api/articles/${idToUpdate}`)
              .expect(expectedArticle)
          );
      });
    });
  });
});
