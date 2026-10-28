import { randomUUID } from "node:crypto";
import { Problem, requireThat } from "../src/security.js";
export class TenantRepository {
  constructor(db, tenant) {
    this.db = db;
    this.tenant = tenant;
  }
  statement(sql, ...args) {
    return this.db.prepare(sql).bind(...args);
  }
  async first(sql, ...args) {
    return this.statement(sql, ...args).first();
  }
  async all(sql, ...args) {
    return (await this.statement(sql, ...args).all()).results;
  }
  command(sql, ...args) {
    return { sql, args };
  }
  async atomic(work) {
    for (let attempt = 0; attempt < 5; attempt++) {
      const business = await this.first(
        "SELECT * FROM businesses WHERE id=?",
        this.tenant,
      );
      requireThat(business, "Business not found", 404);
      const commands = [];
      const result = await work(business, commands);
      if (!commands.length) return result;
      const guard = randomUUID();
      try {
        await this.db.batch([
          this.statement(
            "UPDATE businesses SET revision=revision+1 WHERE id=? AND revision=?",
            this.tenant,
            business.revision,
          ),
          this.statement(
            "INSERT INTO mutation_guards VALUES(?,changes())",
            guard,
          ),
          ...commands.map((c) => this.statement(c.sql, ...c.args)),
          this.statement("DELETE FROM mutation_guards WHERE id=?", guard),
        ]);
        return result;
      } catch (e) {
        if (!String(e).includes("CHECK constraint failed") || attempt === 4) {
          if (String(e).includes("CHECK constraint failed"))
            throw new Problem(409, "Business changed; refresh and retry");
          throw e;
        }
      }
    }
  }
  audit(commands, actor, event, id) {
    commands.push(
      this.command(
        "INSERT INTO audit_events VALUES(?,?,?,?,?,?)",
        randomUUID(),
        this.tenant,
        actor,
        event,
        id,
        Date.now(),
      ),
    );
  }
}
