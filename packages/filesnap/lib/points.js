const LABEL_MAX_CHARS = 72;
export function initialPoints() {
    return { points: [], openTurn: null, lastMessage: null };
}
function label(content) {
    const text = content.find(block => block.type === 'text')?.text;
    if (text === undefined)
        return undefined;
    const firstLine = text.split('\n').find(line => line.trim() !== '');
    if (firstLine === undefined)
        return undefined;
    const trimmed = firstLine.trim();
    return trimmed.length <= LABEL_MAX_CHARS
        ? trimmed
        : `${trimmed.slice(0, LABEL_MAX_CHARS - 1)}…`;
}
export function reducePoints(state, event) {
    switch (event.type) {
        case 'turn/start': {
            const anchor = state.lastMessage?.turn === event.data.turn - 1 ? state.lastMessage : undefined;
            return { ...state, openTurn: event.data.turn, points: [...state.points, {
                        point: '', turn: event.data.turn, at: event.time,
                        ...anchor === undefined ? {} : { boundary: anchor.seq, messageId: anchor.id },
                    }] };
        }
        case 'turn/end':
            return state.openTurn === null ? state : { ...state, openTurn: null };
        case 'assistant/message': {
            // Recorded on the point rather than derived later: only the log knows
            // which message closed which turn, and the browser sees message ids
            // without seeing turns.
            //
            // Every message of a turn overwrites the one before it, so what survives
            // is the last — the bubble the control belongs under. The point that
            // wants it is the NEXT turn's, which normally arrives later; the update
            // below covers the seed order where it did not.
            const lastMessage = { turn: event.data.turn, id: event.data.message.id, seq: event.seq };
            const target = state.points.find(point => point.turn === event.data.turn + 1);
            if (target === undefined)
                return { ...state, lastMessage };
            if (target.messageId === lastMessage.id && target.boundary === lastMessage.seq) {
                return { ...state, lastMessage };
            }
            return {
                ...state,
                lastMessage,
                points: state.points.map(point => point.turn === lastMessage.turn + 1
                    ? { ...point, messageId: lastMessage.id, boundary: lastMessage.seq }
                    : point),
            };
        }
        case 'user/message': {
            // Only a direct human prompt labels a point. Injected context — file
            // notices, skill content, goal continuations — is a user-role message
            // too, and labelling a rewind point with one would name something the
            // user never wrote.
            const turn = state.openTurn;
            if (turn === null || event.data.source.kind !== 'user')
                return state;
            const known = state.points.find(point => point.turn === turn);
            if (known !== undefined && known.label !== undefined)
                return state;
            const text = label(event.data.content);
            if (text === undefined)
                return state;
            // A message can arrive before its turn's capture. The label is held on
            // the point when one exists and is re-read from the state when the
            // capture lands, so neither has to come first.
            const placeholder = { point: '', turn, at: event.time, label: text };
            return {
                ...state,
                points: known === undefined
                    ? [...state.points, placeholder]
                    : state.points.map(point => point.turn === turn ? { ...point, label: text } : point),
            };
        }
        default:
            // Every other event type is someone else's business. This is a
            // merge-extensible map, so the default is a fall-through rather than an
            // exhaustiveness check — and returning `state` unchanged is what makes
            // the projection's change detection free.
            return state;
    }
}
export function foldPoints(events) {
    return capturedPoints(events.reduce(reducePoints, initialPoints()));
}
export function capturedPoints(state) {
    return [...state.points];
}
export function selectPoint(points, input) {
    const exact = points.find(point => point.point === input);
    if (exact !== undefined)
        return exact;
    if (!/^\d+$/u.test(input))
        return undefined;
    const turn = Number(input);
    return points.find(point => point.turn === turn);
}
