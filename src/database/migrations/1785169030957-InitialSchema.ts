import { MigrationInterface, QueryRunner } from "typeorm";

export class InitialSchema1785169030957 implements MigrationInterface {
    name = 'InitialSchema1785169030957'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "user_profiles" ("id" SERIAL NOT NULL, "user_id" integer NOT NULL, "level" integer NOT NULL DEFAULT '1', "exp" integer NOT NULL DEFAULT '0', "coins" integer NOT NULL DEFAULT '0', "gems" integer NOT NULL DEFAULT '0', "data" jsonb NOT NULL DEFAULT '{}', "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_6ca9503d77ae39b4b5a6cc3ba88" UNIQUE ("user_id"), CONSTRAINT "REL_6ca9503d77ae39b4b5a6cc3ba8" UNIQUE ("user_id"), CONSTRAINT "PK_1ec6662219f4605723f1e41b6cb" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "inventories" ("id" SERIAL NOT NULL, "user_id" integer NOT NULL, "item_id" character varying(64) NOT NULL, "quantity" integer NOT NULL DEFAULT '0', "metadata" jsonb, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_7b1946392ffdcb50cfc6ac78c0e" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_ed5fcf21bb6f51d9d134711a8a" ON "inventories" ("user_id", "item_id") `);
        await queryRunner.query(`CREATE TABLE "events" ("id" SERIAL NOT NULL, "code" character varying(128) NOT NULL, "name" character varying(255) NOT NULL, "description" text, "scope" character varying NOT NULL DEFAULT 'global', "status" character varying NOT NULL DEFAULT 'scheduled', "config" jsonb NOT NULL DEFAULT '{}', "start_at" TIMESTAMP WITH TIME ZONE NOT NULL, "end_at" TIMESTAMP WITH TIME ZONE NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_40731c7151fe4be3116e45ddf73" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_0dcf33a3c6edf9ba546f30d801" ON "events" ("code") `);
        await queryRunner.query(`CREATE TABLE "event_logs" ("id" SERIAL NOT NULL, "event_id" integer NOT NULL, "user_id" integer NOT NULL, "action" character varying(64) NOT NULL, "payload" jsonb NOT NULL DEFAULT '{}', "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_b09cf1bb58150797d898076b242" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_d7ecf2ad418d224fe87eaf263d" ON "event_logs" ("event_id", "user_id") `);
        await queryRunner.query(`CREATE TABLE "auth_identities" ("id" SERIAL NOT NULL, "user_id" integer NOT NULL, "provider" character varying(32) NOT NULL, "provider_user_id" character varying(255) NOT NULL, "provider_email" character varying(255), "password_hash" character varying(255), "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_63a29aebcddd09448dbeee4666b" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "uq_auth_user_provider" ON "auth_identities" ("user_id", "provider") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "uq_auth_provider_user" ON "auth_identities" ("provider", "provider_user_id") `);
        await queryRunner.query(`CREATE TABLE "users" ("id" SERIAL NOT NULL, "username" character varying(64), "email" character varying(255), "display_name" character varying(128), "avatar" character varying(512), "active" boolean NOT NULL DEFAULT true, "is_admin" boolean NOT NULL DEFAULT false, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_fe0bb3f6520ee0469504521e71" ON "users" ("username") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_97672ac88f789774dd47f7c8be" ON "users" ("email") `);
        await queryRunner.query(`CREATE TABLE "leaderboards" ("id" SERIAL NOT NULL, "event_id" integer NOT NULL, "user_id" integer NOT NULL, "score" integer NOT NULL DEFAULT '0', "username" character varying(64), "snapshot_at" TIMESTAMP WITH TIME ZONE NOT NULL, CONSTRAINT "PK_190f95e31621935228328d6c20a" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_33f17e776294e5c49c18230df4" ON "leaderboards" ("event_id", "user_id") `);
        await queryRunner.query(`ALTER TABLE "user_profiles" ADD CONSTRAINT "FK_6ca9503d77ae39b4b5a6cc3ba88" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "inventories" ADD CONSTRAINT "FK_0af24dcac4257167eebaf5695ed" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "event_logs" ADD CONSTRAINT "FK_1d0af93b9a23814cf546e45f5c9" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "event_logs" ADD CONSTRAINT "FK_214c8c693849f8f41a41391939b" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "auth_identities" ADD CONSTRAINT "FK_c06a980d83c42611d27a294e55c" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "leaderboards" ADD CONSTRAINT "FK_366354b67712a986663bdeb383c" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "leaderboards" DROP CONSTRAINT "FK_366354b67712a986663bdeb383c"`);
        await queryRunner.query(`ALTER TABLE "auth_identities" DROP CONSTRAINT "FK_c06a980d83c42611d27a294e55c"`);
        await queryRunner.query(`ALTER TABLE "event_logs" DROP CONSTRAINT "FK_214c8c693849f8f41a41391939b"`);
        await queryRunner.query(`ALTER TABLE "event_logs" DROP CONSTRAINT "FK_1d0af93b9a23814cf546e45f5c9"`);
        await queryRunner.query(`ALTER TABLE "inventories" DROP CONSTRAINT "FK_0af24dcac4257167eebaf5695ed"`);
        await queryRunner.query(`ALTER TABLE "user_profiles" DROP CONSTRAINT "FK_6ca9503d77ae39b4b5a6cc3ba88"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_33f17e776294e5c49c18230df4"`);
        await queryRunner.query(`DROP TABLE "leaderboards"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_97672ac88f789774dd47f7c8be"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_fe0bb3f6520ee0469504521e71"`);
        await queryRunner.query(`DROP TABLE "users"`);
        await queryRunner.query(`DROP INDEX "public"."uq_auth_provider_user"`);
        await queryRunner.query(`DROP INDEX "public"."uq_auth_user_provider"`);
        await queryRunner.query(`DROP TABLE "auth_identities"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_d7ecf2ad418d224fe87eaf263d"`);
        await queryRunner.query(`DROP TABLE "event_logs"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_0dcf33a3c6edf9ba546f30d801"`);
        await queryRunner.query(`DROP TABLE "events"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_ed5fcf21bb6f51d9d134711a8a"`);
        await queryRunner.query(`DROP TABLE "inventories"`);
        await queryRunner.query(`DROP TABLE "user_profiles"`);
    }

}
