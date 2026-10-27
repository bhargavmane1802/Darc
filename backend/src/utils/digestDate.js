import { DateTime } from "luxon";

const yesterday = DateTime.now()
    .setZone("Asia/Kolkata")
    .minus({ days: 1 });

export const date = {
    start: yesterday.startOf("day").toJSDate(),
    end: yesterday.plus({ days: 1 }).startOf("day").toJSDate(),
    key: yesterday.toFormat("yyyy-MM-dd")
};