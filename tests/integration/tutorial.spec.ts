import { expect, test } from "@playwright/test";

test('tutorial creation accepts no client fixture or non-practice tutorial', async ({ request }) => {
  for (const data of [{mode:'friends',tutorial:true}, {mode:'practice',tutorial:true,seed:1}, {mode:'practice',tutorial:true,hand:[]}]) {
    expect((await request.post('http://127.0.0.1:2567/rooms', {data})).status()).toBe(400);
  }
});

test('public matchmaking cannot submit teaching or recovery state', async ({ request }) => {
  for (const method of ['create', 'joinOrCreate']) {
    const response = await request.post(`http://127.0.0.1:2567/matchmake/${method}/four-color`, {data:{roomMode:'practice', tutorial:true, recoverySnapshot:{}}});
    const body = await response.json();
    expect(body.room).toBeUndefined();
    expect(body.error).toBeTruthy();
  }
});
