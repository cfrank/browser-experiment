const attachedTabs = new Set<number>();

export async function ensureAttached(tabId: number): Promise<void> {
  if (attachedTabs.has(tabId)) return;

  await chrome.debugger.attach({ tabId }, "1.3");
  attachedTabs.add(tabId);
}

export async function detach(tabId: number): Promise<void> {
  if (!attachedTabs.has(tabId)) return;

  try {
    await chrome.debugger.detach({ tabId });
  } catch {
    // tab may have closed
  }
  attachedTabs.delete(tabId);
}

export async function evaluate(
  tabId: number,
  expression: string,
  returnByValue = true,
): Promise<{ result: unknown; error?: string }> {
  await ensureAttached(tabId);

  const response = (await chrome.debugger.sendCommand(
    { tabId },
    "Runtime.evaluate",
    {
      expression,
      returnByValue,
      awaitPromise: true,
      userGesture: true,
      allowUnsafeEvalBlockedByCSP: true,
    },
  )) as {
    result?: { type: string; value?: unknown; description?: string };
    exceptionDetails?: { exception?: { description?: string }; text?: string };
  };

  if (response.exceptionDetails) {
    const desc =
      response.exceptionDetails.exception?.description ??
      response.exceptionDetails.text ??
      "Unknown error";
    return { result: null, error: desc };
  }

  return { result: response.result?.value ?? response.result?.description ?? null };
}

chrome.debugger.onDetach.addListener((source) => {
  if (source.tabId) {
    attachedTabs.delete(source.tabId);
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  attachedTabs.delete(tabId);
});
