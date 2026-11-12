// The machine-readable contract of the client API (OpenAPI 3.1), served at /openapi.json.
// It is the single source of truth for generated clients, Postman and AI assistants: keep it in step with the routes
// (a test calls every documented operation and fails when one does not exist).

const ref = (n: string) => ({ $ref: `#/components/schemas/${n}` });
const json = (schema: object) => ({ 'application/json': { schema } });
const err = (description: string) => ({ description, content: json(ref('Error')) });
const pathParams = (...names: string[]) => names.map(name => ({ name, in: 'path', required: true, schema: { type: 'string' } }));

const gameId = pathParams('gameId')[0];
const playerId = pathParams('playerId')[0];
const roomKey = pathParams('key')[0];

export function buildOpenApi(serverUrl: string) {
  const common = { 401: err('Missing or wrong API key (code invalid_api_key)'), 403: err('Wrong environment: a test game needs the test key and a live game the live key (code wrong_environment)'), 404: err('Game or player not found') };
  return {
    openapi: '3.1.0',
    info: {
      title: 'MiniGame Studio client API',
      version: '1.0.0',
      description: [
        'Everything a client\'s SERVER calls. Authenticate with the account API key: `Authorization: Bearer mgs_...` (live games) or `mgs_test_...` (test games).',
        'Your own system logs your users in; you tell us who is playing with `playerId`. Money calls need a unique `reference` so retries are safe.',
        'Every error is `{ "error": "message", "code": "machine_code" }`: program against `code`.',
        'Notifications we send to YOU (webhooks) and the requests of the seamless wallet are described under `webhooks`.',
      ].join('\n'),
    },
    servers: [{ url: serverUrl }],
    security: [{ apiKey: [] }],
    tags: [{ name: 'Sessions' }, { name: 'Wallet' }, { name: 'Rooms' }, { name: 'Leaderboards' }],
    paths: {
      '/api/v1/sessions': {
        post: {
          tags: ['Sessions'], operationId: 'createSession', summary: 'Create a 15-minute play link for one player',
          requestBody: { required: true, content: json(ref('CreateSession')) },
          responses: { 200: { description: 'The session', content: json(ref('Session')) }, 400: err('Invalid or missing field (player_id_required, invalid_player_id, ...)'), ...common, 409: err('room_full or no_room_available') },
        },
      },
      '/api/v1/games': {
        get: { tags: ['Sessions'], operationId: 'listGames', summary: 'The games this key can open', responses: { 200: { description: 'Games', content: json({ type: 'object', properties: { games: { type: 'array', items: ref('GameInfo') } } }) }, 401: common[401] } },
      },
      '/api/v1/games/{gameId}/players/{playerId}': {
        get: { tags: ['Wallet'], operationId: 'getPlayer', summary: 'A player\'s balance', parameters: [gameId, playerId], responses: { 200: { description: 'The player', content: json(ref('Player')) }, ...common } },
      },
      '/api/v1/games/{gameId}/players/{playerId}/credit': {
        post: {
          tags: ['Wallet'], operationId: 'creditPlayer', summary: 'Add coins (managed wallet)', description: 'Creates the player if needed. The same `reference` always gives the same answer and never moves coins twice.',
          parameters: [gameId, playerId], requestBody: { required: true, content: json(ref('MoneyMove')) },
          responses: { 200: { description: 'Done (or a repeat of an earlier identical call: duplicate=true)', content: json(ref('MoneyResult')) }, 400: err('invalid_amount, reference_required, ...'), ...common, 409: err('wallet_not_enabled or reference_conflict') },
        },
      },
      '/api/v1/games/{gameId}/players/{playerId}/debit': {
        post: {
          tags: ['Wallet'], operationId: 'debitPlayer', summary: 'Remove coins, e.g. a cash-out (managed wallet)',
          parameters: [gameId, playerId], requestBody: { required: true, content: json(ref('MoneyMove')) },
          responses: { 200: { description: 'Done', content: json(ref('MoneyResult')) }, 400: err('invalid_amount, reference_required, ...'), 402: err('insufficient_balance (includes the current balance); nothing moved'), ...common, 409: err('wallet_not_enabled or reference_conflict') },
        },
      },
      '/api/v1/games/{gameId}/players/{playerId}/transactions': {
        get: {
          tags: ['Wallet'], operationId: 'listTransactions', summary: 'A player\'s coin history, newest first, including bets and wins made by the game',
          parameters: [gameId, playerId, { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100, default: 50 } }, { name: 'before', in: 'query', description: 'Pass `nextBefore` of the previous page', schema: { type: 'string' } }],
          responses: { 200: { description: 'A page of the ledger', content: json(ref('TransactionPage')) }, ...common },
        },
      },
      '/api/v1/games/{gameId}/players/{playerId}/rounds': {
        get: {
          tags: ['Wallet'], operationId: 'listPlayerRounds', summary: 'The finished rounds of a player, newest first: room, round, result, stake and win per option',
          parameters: [gameId, playerId, { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100, default: 50 } }, { name: 'before', in: 'query', description: 'Pass `nextBefore` of the previous page', schema: { type: 'integer' } }, { name: 'room', in: 'query', description: 'Only this room', schema: { type: 'string' } }],
          responses: { 200: { description: 'A page of rounds', content: json(ref('RoundHistoryPage')) }, 400: err('invalid_before or invalid_room'), ...common },
        },
      },
      '/api/v1/games/{gameId}/rooms': {
        get: { tags: ['Rooms'], operationId: 'listRooms', summary: 'Rooms of a game with the players online in each (oldest first, paged)', parameters: [gameId, { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 500, default: 100 } }, { name: 'offset', in: 'query', schema: { type: 'integer', minimum: 0, default: 0 } }], responses: { 200: { description: 'Rooms', content: json({ type: 'object', properties: { rooms: { type: 'array', items: ref('Room') }, total: { type: 'integer' }, limit: { type: 'integer' }, offset: { type: 'integer' } } }) }, ...common } },
        post: { tags: ['Rooms'], operationId: 'createRoom', summary: 'Create a room', parameters: [gameId], requestBody: { required: true, content: json(ref('RoomInput')) }, responses: { 200: { description: 'The room', content: json(ref('Room')) }, 400: err('invalid_room'), ...common, 409: err('room_exists or too_many_rooms') } },
      },
      '/api/v1/games/{gameId}/rooms/{key}': {
        get: { tags: ['Rooms'], operationId: 'getRoom', summary: 'One room with the players online in it', parameters: [gameId, roomKey], responses: { 200: { description: 'The room', content: json(ref('Room')) }, ...common } },
        put: { tags: ['Rooms'], operationId: 'updateRoom', summary: 'Change a room', parameters: [gameId, roomKey], requestBody: { required: true, content: json(ref('RoomInput')) }, responses: { 200: { description: 'The room', content: json(ref('Room')) }, 400: err('invalid_room'), ...common } },
        delete: { tags: ['Rooms'], operationId: 'deleteRoom', summary: 'Delete an empty room (not "main")', parameters: [gameId, roomKey], responses: { 200: { description: 'Deleted', content: json({ type: 'object', properties: { ok: { type: 'boolean' } } }) }, ...common, 409: err('room_busy or room_protected') } },
      },
      '/api/v1/games/{gameId}/leaderboard': {
        get: {
          tags: ['Leaderboards'], operationId: 'getLeaderboard', summary: 'A ranking to show in your own app',
          parameters: [gameId,
            { name: 'room', in: 'query', description: 'Only this room (default: the whole game)', schema: { type: 'string' } },
            { name: 'period', in: 'query', schema: { type: 'string', enum: ['day', 'week', 'month', 'all'], default: 'all' } },
            { name: 'metric', in: 'query', schema: { type: 'string', enum: ['winnings', 'wagered', 'biggest_win', 'net'], default: 'winnings' } },
            { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 } },
            { name: 'playerId', in: 'query', description: 'Also return this player\'s own rank in `me`', schema: { type: 'string' } }],
          responses: { 200: { description: 'The ranking (cached for 5 seconds)', content: json(ref('Leaderboard')) }, 400: err('invalid_period or invalid_metric'), ...common },
        },
      },
    },
    webhooks: {
      roundSettled: { post: { summary: 'A round finished and was paid', description: 'Sent to your webhook address. Verify `X-Minigame-Signature` (v1= + hex HMAC-SHA256 of "<X-Minigame-Timestamp>.<raw body>" with your signing secret). Answer any 2xx. Retries: 10 s, 1 min, 5 min, 30 min, 2 h, 6 h.', requestBody: { content: json(ref('RoundSettledEvent')) }, responses: { 200: { description: 'Received' } } } },
      playerNeedsCoins: { post: { summary: 'A player tried to bet with too few coins (managed or seamless wallet), at most once per player and 5 minutes', requestBody: { content: json(ref('NeedsCoinsEvent')) }, responses: { 200: { description: 'Received' } } } },
      walletOperationFailed: { post: { summary: 'A stored seamless-wallet operation (credit or rollback) could not be delivered after all retries', requestBody: { content: json(ref('OperationFailedEvent')) }, responses: { 200: { description: 'Received' } } } },
      webhookTest: { post: { summary: 'The "Send test" button', requestBody: { content: json(ref('Envelope')) }, responses: { 200: { description: 'Received' } } } },
      seamlessWallet: {
        post: {
          summary: 'Seamless wallet request (YOU implement this endpoint)',
          description: 'One address receives all of these, signed like webhooks. `type` is `ping`, `balance`, `debit` (a stake), `credit` (a win) or `rollback` (undo the debit with the same `reference`, if it was applied; a no-op otherwise). `reference` is an idempotency key: answer a repeat with the first answer. Answer 200 `{ "balance": <integer> }`; for a debit with too little money answer 402 `{ "code": "insufficient_balance" }`. Other 4xx = refused for good; 5xx or no answer within 5 seconds = unknown (we roll back and retry).',
          requestBody: { content: json(ref('SeamlessRequest')) },
          responses: { 200: { description: 'Done', content: json({ type: 'object', properties: { balance: { type: 'integer', minimum: 0 } } }) }, 402: { description: 'insufficient_balance' } },
        },
      },
    },
    components: {
      securitySchemes: { apiKey: { type: 'http', scheme: 'bearer', description: 'Your account API key: mgs_... (live) or mgs_test_... (test games).' } },
      schemas: {
        Error: { type: 'object', required: ['error', 'code'], properties: { error: { type: 'string' }, code: { type: 'string' } } },
        CreateSession: {
          type: 'object', required: ['gameId'],
          properties: {
            gameId: { type: 'string', description: 'lic_...' },
            playerId: { type: 'string', pattern: '^[A-Za-z0-9_.:@-]{1,64}$', description: 'YOUR id for the person. Required unless the game allows guest login.' },
            displayName: { type: 'string', maxLength: 40 },
            avatarUrl: { type: 'string', format: 'uri', description: 'https only' },
            room: { type: 'string', description: '"auto" (default) or the key of a room.' },
            startingBalance: { type: 'integer', minimum: 0, description: "Managed wallet only: coins for a player this call creates (ignored for a player who already exists). Saves a separate credit." },
          },
        },
        Session: {
          type: 'object', required: ['playUrl', 'sessionToken', 'expiresIn', 'gameId', 'game'],
          properties: { playUrl: { type: 'string', format: 'uri' }, sessionToken: { type: 'string' }, expiresIn: { type: 'integer', example: 900 }, gameId: { type: 'string' }, game: { type: 'string' }, playerId: { type: ['string', 'null'] }, playerCreated: { type: 'boolean', description: 'True when this call created the player (so startingBalance was applied)' }, room: { type: 'string' } },
        },
        GameInfo: { type: 'object', properties: { gameId: { type: 'string' }, name: { type: 'string' }, game: { type: 'string' }, status: { type: 'string' }, guestLogin: { type: 'boolean' }, walletMode: { type: 'string', enum: ['demo', 'managed', 'seamless'] }, mode: { type: 'string', enum: ['live', 'test'] } } },
        Player: { type: 'object', properties: { playerId: { type: 'string' }, displayName: { type: 'string' }, balance: { type: 'integer' }, createdAt: { type: 'integer' }, lastSeen: { type: 'integer' } } },
        MoneyMove: {
          type: 'object', required: ['amount', 'reference'],
          properties: { amount: { type: 'integer', minimum: 1, maximum: 1_000_000_000_000 }, reference: { type: 'string', pattern: '^[A-Za-z0-9_.:@-]{1,100}$', description: 'Unique per operation (e.g. your order id).' }, note: { type: 'string', maxLength: 200 }, displayName: { type: 'string', description: 'credit only' } },
        },
        MoneyResult: { type: 'object', properties: { playerId: { type: 'string' }, balance: { type: 'integer' }, transactionId: { type: 'string' }, duplicate: { type: 'boolean' } } },
        TransactionPage: {
          type: 'object',
          properties: {
            playerId: { type: 'string' }, balance: { type: 'integer' }, nextBefore: { type: ['string', 'null'] },
            transactions: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, type: { type: 'string', enum: ['credit', 'debit', 'bet', 'win', 'starting', 'refill'] }, amount: { type: 'integer' }, balanceAfter: { type: 'integer' }, reference: { type: ['string', 'null'] }, note: { type: ['string', 'null'] }, room: { type: ['string', 'null'], description: 'Bets and wins of a round: the room key' }, round: { type: ['integer', 'null'], description: 'Bets and wins of a round: the round number' }, createdAt: { type: 'integer' } } } },
          },
        },
        RoundHistoryPage: {
          type: 'object',
          properties: {
            playerId: { type: 'string' }, nextBefore: { type: ['integer', 'null'], description: 'Pass as `before` for the next page; null on the last page' },
            rounds: { type: 'array', items: { type: 'object', properties: { game: { type: 'string' }, room: { type: 'string' }, round: { type: ['integer', 'null'] }, result: { type: 'array', items: { type: 'string' }, description: 'Winning option ids (more than one when the bonus hits)' }, bet: { type: 'integer' }, win: { type: 'integer' }, net: { type: 'integer' }, bets: { type: ['array', 'null'], description: 'Stake and win per option; null for rounds played before this field existed', items: { type: 'object', properties: { option: { type: 'string' }, label: { type: 'string' }, amount: { type: 'integer' }, win: { type: 'integer' } } } }, time: { type: 'integer', description: 'When the round ended (ms)' } } } },
          },
        },
        RoomInput: {
          type: 'object',
          properties: {
            key: { type: 'string', pattern: '^[a-z0-9][a-z0-9_-]{0,31}$', description: 'create only' }, name: { type: 'string', maxLength: 40 },
            capacity: { type: ['integer', 'null'], minimum: 1, description: 'Soft limit of players at once; null = unlimited' }, auto: { type: 'boolean', description: 'Include in automatic placement' },
            metadata: { type: 'object', additionalProperties: { type: 'string', maxLength: 200 }, description: 'Your own notes (who created it, an invite code...). Up to 10 entries; never shown to players.' },
            deleteWhenEmptyMinutes: { type: ['integer', 'null'], minimum: 1, maximum: 10080, description: 'Delete the room after nobody has been in it for this many minutes; null = keep it' },
            overrides: { type: 'object', properties: { title: { type: 'string' }, chips: { type: 'array', items: { type: 'integer' }, minItems: 2, maxItems: 5 }, maxPerTarget: { type: 'integer' }, timing: { type: 'object', properties: { betSeconds: { type: 'integer', minimum: 8, maximum: 120 }, spinSeconds: { type: 'integer', minimum: 3, maximum: 15 }, resultSeconds: { type: 'integer', minimum: 3, maximum: 20 } } } } },
          },
        },
        Room: { type: 'object', properties: { key: { type: 'string' }, name: { type: 'string' }, capacity: { type: ['integer', 'null'] }, auto: { type: 'boolean' }, overrides: { type: 'object' }, metadata: { type: 'object' }, deleteWhenEmptyMinutes: { type: ['integer', 'null'] }, online: { type: 'integer' }, createdAt: { type: 'integer' } } },
        Leaderboard: {
          type: 'object',
          properties: {
            room: { type: ['string', 'null'] }, period: { type: 'string' }, metric: { type: 'string' }, updatedAt: { type: 'integer' },
            entries: { type: 'array', items: { type: 'object', properties: { rank: { type: 'integer' }, playerId: { type: ['string', 'null'] }, displayName: { type: ['string', 'null'] }, avatarUrl: { type: ['string', 'null'] }, value: { type: 'integer' }, won: { type: 'integer' }, wagered: { type: 'integer' }, biggestWin: { type: 'integer' }, rounds: { type: 'integer' } } } },
            me: { type: ['object', 'null'] },
          },
        },
        Envelope: { type: 'object', properties: { id: { type: 'string', description: 'Unique: ignore repeats' }, type: { type: 'string' }, createdAt: { type: 'string', format: 'date-time' }, gameId: { type: ['string', 'null'] }, livemode: { type: 'boolean' }, data: { type: 'object' } } },
        RoundSettledEvent: { allOf: [ref('Envelope'), { type: 'object', properties: { data: { type: 'object', properties: { game: { type: 'string' }, room: { type: 'string' }, round: { type: 'integer' }, result: { type: 'array', items: { type: 'string' } }, playerCount: { type: 'integer' }, truncated: { type: 'boolean' }, players: { type: 'array', items: { type: 'object', properties: { playerId: { type: 'string' }, bet: { type: 'integer' }, win: { type: 'integer' }, bets: { type: 'array', description: 'What this player staked and won on each option', items: { type: 'object', properties: { option: { type: 'string' }, amount: { type: 'integer' }, win: { type: 'integer' } } } } } } } } } } }] },
        NeedsCoinsEvent: { allOf: [ref('Envelope'), { type: 'object', properties: { data: { type: 'object', properties: { playerId: { type: 'string' }, room: { type: 'string' }, balance: { type: 'integer' } } } } }] },
        OperationFailedEvent: { allOf: [ref('Envelope'), { type: 'object', properties: { data: { type: 'object', properties: { type: { type: 'string', enum: ['credit', 'rollback'] }, playerId: { type: 'string' }, amount: { type: 'integer' }, reference: { type: 'string' }, error: { type: 'string' } } } } }] },
        SeamlessRequest: { type: 'object', required: ['type', 'reference'], properties: { type: { type: 'string', enum: ['ping', 'balance', 'debit', 'credit', 'rollback'] }, gameId: { type: ['string', 'null'] }, livemode: { type: 'boolean' }, playerId: { type: 'string' }, amount: { type: 'integer' }, reference: { type: 'string' }, note: { type: 'string' } } },
      },
    },
  };
}
