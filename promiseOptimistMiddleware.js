import { BEGIN, COMMIT, REVERT } from "./reducerWrapper.js";

// The default promise action suffixes
const PENDING = "PENDING";
const FULFILLED = "FULFILLED";
const REJECTED = "REJECTED";

let transactionID = 0;

const isPromise = obj =>
  !!obj &&
  (typeof obj === "object" || typeof obj === "function") &&
  typeof obj.then === "function";

const getAction = (
  { type, meta },
  newPayload,
  isRejected,
  optimistTransactionID
) => ({
  // Concatentate the type string property.
  type: `${type}_${isRejected ? REJECTED : FULFILLED}`,
  payload: newPayload,

  ...(meta !== undefined ? { meta } : {}),

  ...(isRejected ? { error: true } : {}),

  // commit or revert the action if it was optimistic
  ...(optimistTransactionID !== null
    ? {
        optimist: {
          type: isRejected ? REVERT : COMMIT,
          id: optimistTransactionID
        }
      }
    : {})
});

export default ({ dispatch }) => next => action => {
  let payload = action.payload;

  if (typeof payload === "function") {
    // promise could be returned by async function
    payload = payload();
  }

  if (!isPromise(payload)) {
    // continue, and reassign payload since we executed it if it was a function
    return next({
      ...action,
      payload
    });
  }

  /**
   * At this point there is a promise
   */

  const { type, meta, optimisticData } = action;

  // if this action is optimistic, generate unique transactionID
  const optimistTransactionID = optimisticData ? transactionID++ : null;

  // First, dispatch the pending action, including any optimistic data and/or meta from the original action.
  next({
    type: `${type}_${PENDING}`,

    ...(meta !== undefined ? { meta } : {}),

    // if we have optimistic data, include optimistic payload and optimist 'BEGIN' action
    ...(optimisticData !== undefined
      ? {
          payload: optimisticData,
          optimist: { type: BEGIN, id: optimistTransactionID }
        }
      : {})
  });

  // construct rejected promise callbacks

  // This will dispatch the rejected action, (which will revert if optimistic) and rethrow the error
  const handleReject = error => {
    dispatch(getAction(action, error, true, optimistTransactionID));
    throw error;
  };

  // This will dispatch the fulfilled action, (which will commit if optimistic),
  // and return both the value and fulfilled action
  const handleFulfill = (value = null) => {
    const resolvedAction = getAction(
      action,
      value,
      false,
      optimistTransactionID
    );
    dispatch(resolvedAction);

    return { value, action: resolvedAction };
  };

  // return a promise so that dispatches can be 'await'ed
  return promise.then(handleFulfill, handleReject);
};
