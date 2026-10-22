import { useEffect, useRef, useState } from "react";
import { contentRequestSchema, plainText } from "@island/contracts";
import type {
  ContentRequest,
  ContentCommand,
  ContentPage,
  SceneDocument,
  DocumentEntry,
  SceneCollection,
} from "@island/contracts";
import { api, RequestError } from "../api";
import { readDraft, writeDraft } from "../drafts";
type Saved = {
  documents: SceneDocument[];
  entries: Record<string, DocumentEntry[]>;
  queue: ContentRequest[];
  drafts: Record<string, string>;
  undo?: ContentCommand[][];
  draftRevisions?: Record<string, number>;
};
const empty = (): Saved => ({
  documents: [],
  entries: {},
  queue: [],
  drafts: {},
});
export default function SceneContentPanel({
  worldId,
  userId,
  collectionId,
  token,
  readOnly = false,
}: {
  worldId: string;
  userId: string;
  collectionId: string;
  token?: string;
  readOnly?: boolean;
}) {
  const key = `scene-content-v1:${userId}:${worldId}`,
    ref = useRef<Saved>(empty()),
    [data, setData] = useState<Saved>(empty()),
    [ready, setReady] = useState(false),
    [status, setStatus] = useState("正在读取作品…"),
    [docId, setDocId] = useState(""),
    [entryId, setEntryId] = useState("new"),
    [title, setTitle] = useState(""),
    [kind, setKind] = useState<"note" | "notebook">("notebook"),
    [search, setSearch] = useState(""),
    [filter, setFilter] = useState("shelf"),
    [next, setNext] = useState<string | null>(null),
    [entryNext, setEntryNext] = useState<string | null>(null),
    [collections, setCollections] = useState<SceneCollection[]>([]),
    [conflict, setConflict] = useState(false),
    [comparison, setComparison] = useState<{
      local: string;
      cloud: DocumentEntry;
      merged: string;
    } | null>(null),
    [history, setHistory] = useState<{
      entry: DocumentEntry;
      items: { id: string; before: { text?: string }; createdAt: string }[];
      nextCursor: string | null;
    } | null>(null),
    [listedIds, setListedIds] = useState<string[] | null>(null);
  const busy = useRef(false),
    mounted = useRef(true),
    conflictRef = useRef(false);
  const q = token ? `&t=${encodeURIComponent(token)}` : "";
  const persist = async (v: Saved) => {
    ref.current = v;
    if (mounted.current) setData(v);
    if (!readOnly)
      try {
        await writeDraft(key, v);
      } catch {
        setStatus("浏览器无法保存草稿，请下载救援文件后再离开。");
        throw Error("本地存储不可用");
      }
  };
  const state = async () => {
    const s = await api<{ collections: SceneCollection[] }>(
      `/worlds/${worldId}/content/state?${q.slice(1)}`,
    );
    setCollections(s.collections);
  };
  const list = async (cursor?: string) => {
    try {
      const params = new URLSearchParams({ limit: "20", search });
      if (readOnly || filter === "shelf")
        params.set("collection", collectionId);
      else params.set("filter", filter);
      if (cursor) params.set("cursor", cursor);
      const r = await api<ContentPage<SceneDocument>>(
        `/worlds/${worldId}/documents?${params}${q}`,
      );
      setNext(r.nextCursor);
      const documents = [
        ...ref.current.documents.filter(
          (d) => !r.items.some((x) => x.id === d.id),
        ),
        ...r.items,
      ];
      setListedIds((ids) =>
        cursor
          ? [...(ids ?? []), ...r.items.map((d) => d.id)]
          : r.items.map((d) => d.id),
      );
      if (!ref.current.queue.length)
        await persist({ ...ref.current, documents });
      setStatus("已载入这一页作品。");
    } catch (e) {
      if (readOnly) {
        ref.current = empty();
        setData(empty());
      }
      setStatus((e as Error).message);
    }
  };
  const open = async (
    id: string,
    cursor?: string,
    preserveSelection = false,
  ) => {
    setDocId(id);
    if (!preserveSelection) setEntryId("new");
    try {
      const r = await api<
        ContentPage<DocumentEntry> & { document: SceneDocument }
      >(
        `/worlds/${worldId}/documents/${id}/entries?limit=20${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}${q}`,
      );
      setEntryNext(r.nextCursor);
      if (!ref.current.queue.length)
        await persist({
          ...ref.current,
          documents: ref.current.documents.map((d) =>
            d.id === id ? r.document : d,
          ),
          entries: {
            ...ref.current.entries,
            [id]: cursor
              ? [...(ref.current.entries[id] ?? []), ...r.items]
              : r.items,
          },
        });
    } catch (e) {
      if (readOnly) {
        setDocId("");
        setData(empty());
      }
      setStatus((e as Error).message);
    }
  };
  const flush = async () => {
    if (readOnly || busy.current || conflictRef.current) return;
    busy.current = true;
    try {
      while (ref.current.queue.length) {
        setStatus("正在同步作品…");
        const request = ref.current.queue[0]!;
        await api(`/worlds/${worldId}/content/commands`, {
          method: "POST",
          body: JSON.stringify(request),
        });
        await persist({ ...ref.current, queue: ref.current.queue.slice(1) });
      }
      setStatus("作品已保存到云端。");
      await state();
      await list();
      if (docId) await open(docId);
    } catch (e) {
      if (
        e instanceof RequestError &&
        [400, 403, 409, 413, 422].includes(e.status)
      ) {
        conflictRef.current = true;
        setConflict(true);
        setStatus(`${e.message} 本地文字和原提交已保留。`);
      } else
        setStatus("离线或网络中断，作品已保留在本机；联网后重试同一次提交。");
    } finally {
      busy.current = false;
    }
  };
  useEffect(() => {
    mounted.current = true;
    let active = true;
    void (async () => {
      const saved = readOnly
        ? undefined
        : await readDraft<Saved>(key).catch(() => undefined);
      if (!active) return;
      if (saved) {
        ref.current = saved;
        setData(saved);
      }
      setReady(true);
    })();
    return () => {
      active = false;
      mounted.current = false;
    };
  }, [key]);
  useEffect(() => {
    if (!ready) return;
    void state()
      .then(() => (ref.current.queue.length ? flush() : list()))
      .catch((e) => setStatus((e as Error).message));
    const online = () => void flush();
    window.addEventListener("online", online);
    return () => window.removeEventListener("online", online);
  }, [ready]);
  // Revalidate visitors' permission regularly. Cached delivery is never permanent authorization.
  useEffect(() => {
    if (!readOnly) return;
    const t = setInterval(() => {
      void state().catch(() => {
        setData(empty());
        setDocId("");
        setStatus("参观权限已关闭，请返回主岛。");
      });
    }, 10000);
    return () => clearInterval(t);
  }, [readOnly]);
  useEffect(() => {
    const refresh = (e: Event) => {
      if ((e as CustomEvent).detail.worldId !== worldId) return;
      if (ref.current.queue.length) {
        setStatus("云端作品有变化，本机待同步文字已保留。");
        return;
      }
      void state();
      void list();
      if (docId) void open(docId, undefined, true);
    };
    window.addEventListener("island-content-changed", refresh);
    return () => window.removeEventListener("island-content-changed", refresh);
  }, [worldId, docId, filter, search]);
  const enqueue = async (
    commands: ContentCommand[],
    optimistic: (s: Saved) => Saved,
    undoing = false,
  ) => {
    if (readOnly || !ready) return;
    const request = {
      idempotencyKey: crypto.randomUUID(),
      deviceId: crypto.randomUUID(),
      commands,
    };
    if (!contentRequestSchema.safeParse(request).success) {
      setStatus("文字或提交格式不符合要求，请缩短内容；本机稿件仍保留。");
      return;
    }
    const inverse: ContentCommand[] = [];
    for (const cmd of commands) {
      if (cmd.op === "entry.edit") {
        const e = Object.values(ref.current.entries)
          .flat()
          .find((e) => e.id === cmd.id);
        if (e)
          inverse.unshift({
            ...cmd,
            text: e.text,
            expectedRevision: cmd.expectedRevision + 1,
          });
      }
      if (cmd.op === "document.title") {
        const d = ref.current.documents.find((d) => d.id === cmd.id);
        if (d)
          inverse.unshift({
            ...cmd,
            title: d.title,
            expectedRevision: cmd.expectedRevision + 1,
          });
      }
      if (cmd.op === "document.shelve" || cmd.op === "document.unshelve")
        inverse.unshift({
          ...cmd,
          op:
            cmd.op === "document.shelve"
              ? "document.unshelve"
              : "document.shelve",
          expectedRevision: cmd.expectedRevision + 1,
        });
    }
    try {
      await persist({
        ...optimistic(ref.current),
        undo: undoing
          ? (ref.current.undo ?? []).slice(0, -1)
          : inverse.length
            ? [...(ref.current.undo ?? []).slice(-24), inverse]
            : (ref.current.undo ?? []),
        queue: [...ref.current.queue, request],
      });
      void flush();
    } catch (e) {
      setStatus((e as Error).message);
    }
  };
  const doc = data.documents.find((d) => d.id === docId),
    entries = data.entries[docId] ?? [],
    chosen = entries.find((e) => e.id === entryId),
    draftKey = `${docId}:${entryId}`,
    text = data.drafts[draftKey] ?? chosen?.text ?? "";
  const download = () => {
    const blob = new Blob(
        [
          JSON.stringify(
            {
              format: "island-content-rescue",
              version: 1,
              complete: false,
              missing: {
                documentIds: ref.current.documents
                  .filter((d) => !ref.current.entries[d.id])
                  .map((d) => d.id),
                allDocumentPagesEnumerated: false,
                allEntryPagesEnumerated: false,
                layoutIncluded: false,
              },
              worldId,
              ...ref.current,
            },
            null,
            2,
          ),
        ],
        { type: "application/json" },
      ),
      url = URL.createObjectURL(blob),
      a = document.createElement("a");
    a.href = url;
    a.download = "书屋本机草稿-不完整备份.json";
    a.click();
    URL.revokeObjectURL(url);
  };
  if (!ready) return <p role="status">正在恢复本机草稿…</p>;
  return (
    <section className="scene-content-panel" aria-label="书屋作品">
      <p role="status">
        {status}{" "}
        {data.queue.length > 0 && `（${data.queue.length} 次等待同步）`}
      </p>
      <div className="content-actions">
        <input
          aria-label="查找作品标题"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {!readOnly && (
          <select
            aria-label="作品范围"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            <option value="shelf">这座书架</option>
            <option value="active">全部作品</option>
            <option value="unshelved">未上架</option>
            <option value="trash">回收站</option>
          </select>
        )}
        <button onClick={() => void list()}>查找 / 刷新</button>
      </div>
      {!readOnly && (
        <fieldset>
          <legend>写新作品</legend>
          <input
            aria-label="新作品标题"
            placeholder="给作品起个名字"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <select
            aria-label="作品类型"
            value={kind}
            onChange={(e) => setKind(e.target.value as typeof kind)}
          >
            <option value="notebook">笔记本 · 可持续添加</option>
            <option value="note">短笺 · 80 字</option>
          </select>
          <button
            onClick={() => {
              if (!plainText(60).safeParse(title).success) {
                setStatus("标题最多 60 个可见字符，请保留文字后缩短。");
                return;
              }
              const id = crypto.randomUUID();
              void enqueue(
                [
                  {
                    op: "document.create",
                    id,
                    kind,
                    title: title || "未命名作品",
                  },
                ],
                (s) => ({
                  ...s,
                  documents: [
                    {
                      id,
                      kind,
                      title: title || "未命名作品",
                      revision: 1,
                      createdAt: new Date().toISOString(),
                      deletedAt: null,
                      collectionId: null,
                    },
                    ...s.documents,
                  ],
                }),
              );
              setDocId(id);
              setEntryId("new");
              setTitle("");
            }}
          >
            新建
          </button>
        </fieldset>
      )}
      <ul className="content-list">
        {(listedIds === null
          ? data.documents
          : listedIds.flatMap((id) => {
              const d = data.documents.find((d) => d.id === id);
              return d ? [d] : [];
            })
        ).map((d, index) => (
          <li key={d.id}>
            {!readOnly && filter === "shelf" && index > 0 && (
              <button
                disabled={conflict || !!data.queue.length}
                aria-label={`把${d.title}上移`}
                onClick={() => {
                  const c = collections.find((c) => c.id === collectionId);
                  if (c)
                    void enqueue(
                      [
                        {
                          op: "document.move",
                          id: d.id,
                          collectionId,
                          expectedRevision: c.revision,
                          beforeId: listedIds?.[index - 1] ?? null,
                        },
                      ],
                      (s) => s,
                    );
                }}
              >
                上移
              </button>
            )}
            <button onClick={() => void open(d.id)}>
              {d.title || "未命名作品"}{" "}
              <small>
                {d.collectionId ? "已上架" : "未上架"} · v{d.revision}
              </small>
            </button>
          </li>
        ))}
      </ul>
      {next && <button onClick={() => void list(next)}>下一页作品</button>}
      {doc && (
        <article>
          <h3>{doc.title}</h3>
          {!readOnly && !doc.deletedAt && (
            <button
              disabled={conflict || !!data.queue.length}
              onClick={() => {
                const value = prompt("作品新标题", doc.title);
                if (value !== null)
                  void enqueue(
                    [
                      {
                        op: "document.title",
                        id: doc.id,
                        expectedRevision: doc.revision,
                        title: value,
                      },
                    ],
                    (s) => ({
                      ...s,
                      documents: s.documents.map((d) =>
                        d.id === doc.id
                          ? { ...d, title: value, revision: d.revision + 1 }
                          : d,
                      ),
                    }),
                  );
              }}
            >
              修改标题
            </button>
          )}
          <div className="content-actions">
            {!readOnly && !doc.deletedAt && (
              <>
                <button
                  onClick={() => {
                    const c = collections.find(
                      (c) => c.id === (doc.collectionId ?? collectionId),
                    );
                    if (!c) {
                      setStatus("请先等待书架布局保存到云端。");
                      return;
                    }
                    void enqueue(
                      [
                        {
                          op: doc.collectionId
                            ? "document.unshelve"
                            : "document.shelve",
                          id: doc.id,
                          collectionId: c.id,
                          expectedRevision: c.revision,
                        },
                      ],
                      (s) => ({
                        ...s,
                        documents: s.documents.map((d) =>
                          d.id === doc.id
                            ? {
                                ...d,
                                collectionId: doc.collectionId ? null : c.id,
                              }
                            : d,
                        ),
                      }),
                    );
                  }}
                >
                  {doc.collectionId ? "从书架取下" : "上架到这座书架"}
                </button>
                <button
                  onClick={() => {
                    if (confirm("把这份作品移入回收站？内容会保留，可以恢复。"))
                      void enqueue(
                        [
                          {
                            op: "document.archive",
                            id: doc.id,
                            expectedRevision: doc.revision,
                          },
                        ],
                        (s) => ({
                          ...s,
                          documents: s.documents.map((d) =>
                            d.id === doc.id
                              ? {
                                  ...d,
                                  revision: d.revision + 1,
                                  deletedAt: new Date().toISOString(),
                                  collectionId: null,
                                }
                              : d,
                          ),
                        }),
                      );
                  }}
                >
                  移入回收站
                </button>
              </>
            )}
            {!readOnly && doc.deletedAt && (
              <button
                onClick={() =>
                  void enqueue(
                    [
                      {
                        op: "document.restore",
                        id: doc.id,
                        expectedRevision: doc.revision,
                      },
                    ],
                    (s) => ({
                      ...s,
                      documents: s.documents.map((d) =>
                        d.id === doc.id
                          ? {
                              ...d,
                              revision: d.revision + 1,
                              deletedAt: null,
                              collectionId: null,
                            }
                          : d,
                      ),
                    }),
                  )
                }
              >
                恢复到未上架
              </button>
            )}
          </div>
          <ol>
            {entries.map((e, index) => (
              <li key={e.id}>
                <p className="plain-text">{e.text}</p>
                {!readOnly && !doc.deletedAt && (
                  <span className="content-actions">
                    <button onClick={() => setEntryId(e.id)}>修改这一条</button>
                    {index > 0 && (
                      <button
                        disabled={conflict || !!data.queue.length}
                        onClick={() =>
                          void enqueue(
                            [
                              {
                                op: "entry.move",
                                id: e.id,
                                documentId: doc.id,
                                expectedRevision: doc.revision,
                                beforeId: entries[index - 1]!.id,
                              },
                            ],
                            (s) => s,
                          )
                        }
                      >
                        本条上移
                      </button>
                    )}
                    <button
                      onClick={() =>
                        void api<{
                          items: {
                            id: string;
                            before: { text?: string };
                            createdAt: string;
                          }[];
                          nextCursor: string | null;
                        }>(`/worlds/${worldId}/content/history/${e.id}`)
                          .then((r) => setHistory({ entry: e, ...r }))
                          .catch((e) => setStatus(e.message))
                      }
                    >
                      正文历史
                    </button>
                  </span>
                )}
              </li>
            ))}
          </ol>
          {entryNext && (
            <button onClick={() => void open(doc.id, entryNext)}>
              下一页正文
            </button>
          )}
          {!readOnly && !doc.deletedAt && (
            <>
              <label>
                {chosen ? "修改正文" : "继续写一条"}
                <textarea
                  aria-label="作品正文"
                  rows={7}
                  value={text}
                  onChange={(e) => {
                    void persist({
                      ...ref.current,
                      draftRevisions: {
                        ...ref.current.draftRevisions,
                        [draftKey]:
                          ref.current.draftRevisions?.[draftKey] ??
                          chosen?.revision ??
                          doc.revision,
                      },
                      drafts: {
                        ...ref.current.drafts,
                        [draftKey]: e.target.value,
                      },
                    }).catch(() => {});
                  }}
                />
              </label>
              <button
                disabled={conflict}
                onClick={() => {
                  if (
                    !plainText(doc.kind === "note" ? 80 : 4000, true).safeParse(
                      text,
                    ).success
                  ) {
                    setStatus(
                      doc.kind === "note"
                        ? "短笺最多 80 字；更长的内容请写入笔记本。"
                        : "每条正文最多 4000 个可见字符，可以分条继续写。",
                    );
                    return;
                  }
                  if (doc.kind === "note" && !chosen && entries.length) {
                    setStatus("这张短笺已有正文，请点‘修改这一条’。");
                    return;
                  }
                  const id = chosen?.id ?? crypto.randomUUID(),
                    cmd: ContentCommand = chosen
                      ? {
                          op: "entry.edit",
                          id,
                          expectedRevision:
                            data.draftRevisions?.[draftKey] ?? chosen.revision,
                          text,
                        }
                      : {
                          op: "entry.add",
                          id,
                          documentId: doc.id,
                          expectedRevision: doc.revision,
                          text,
                        };
                  void enqueue([cmd], (s) => ({
                    ...s,
                    documents: s.documents.map((d) =>
                      d.id === doc.id && !chosen
                        ? { ...d, revision: d.revision + 1 }
                        : d,
                    ),
                    entries: {
                      ...s.entries,
                      [doc.id]: chosen
                        ? (s.entries[doc.id] ?? []).map((e) =>
                            e.id === id
                              ? { ...e, text, revision: e.revision + 1 }
                              : e,
                          )
                        : [
                            ...(s.entries[doc.id] ?? []),
                            {
                              id,
                              documentId: doc.id,
                              text,
                              position: (s.entries[doc.id] ?? []).length,
                              revision: 1,
                            },
                          ],
                    },
                    drafts: Object.fromEntries(
                      Object.entries(s.drafts).filter(([k]) => k !== draftKey),
                    ),
                    draftRevisions: Object.fromEntries(
                      Object.entries(s.draftRevisions ?? {}).filter(
                        ([k]) => k !== draftKey,
                      ),
                    ),
                  }));
                  setEntryId("new");
                }}
              >
                保存正文
              </button>
              {chosen && (
                <button onClick={() => setEntryId("new")}>再写一条</button>
              )}
            </>
          )}
        </article>
      )}
      {history && (
        <aside aria-label="正文历史">
          <h3>恢复正文版本</h3>
          <p>只恢复这一条文字，房屋布局保持当前版本。</p>
          {history.items
            .filter((h) => typeof h.before?.text === "string")
            .map((h) => (
              <div key={h.id}>
                <p>{h.createdAt}</p>
                <p className="plain-text">{h.before.text}</p>
                <button
                  disabled={conflict || !!data.queue.length}
                  onClick={() => {
                    void enqueue(
                      [
                        {
                          op: "entry.restore",
                          id: history.entry.id,
                          expectedRevision: history.entry.revision,
                          historyId: h.id,
                        },
                      ],
                      (s) => s,
                    );
                    setHistory(null);
                  }}
                >
                  恢复这版正文
                </button>
              </div>
            ))}
          {history.nextCursor && (
            <button
              onClick={() =>
                void api<{
                  items: typeof history.items;
                  nextCursor: string | null;
                }>(
                  `/worlds/${worldId}/content/history/${history.entry.id}?cursor=${history.nextCursor}`,
                )
                  .then((r) =>
                    setHistory({
                      ...history,
                      items: [...history.items, ...r.items],
                      nextCursor: r.nextCursor,
                    }),
                  )
                  .catch((e) => setStatus(e.message))
              }
            >
              更早的正文历史
            </button>
          )}
          <button onClick={() => setHistory(null)}>关闭历史</button>
        </aside>
      )}
      {comparison && (
        <aside aria-label="正文冲突对照">
          <h3>比较并合并文字</h3>
          <p>本机待提交</p>
          <p className="plain-text">{comparison.local}</p>
          <p>云端当前版本 v{comparison.cloud.revision}</p>
          <p className="plain-text">{comparison.cloud.text}</p>
          <label>
            合并后的文字
            <textarea
              aria-label="合并后的文字"
              value={comparison.merged}
              onChange={(e) =>
                setComparison({ ...comparison, merged: e.target.value })
              }
            />
          </label>
          <button
            onClick={() => {
              const first = ref.current.queue[0];
              if (!first || first.commands.length !== 1) return;
              const cmd: ContentCommand = {
                op: "entry.edit",
                id: comparison.cloud.id,
                expectedRevision: comparison.cloud.revision,
                text: comparison.merged,
              };
              void persist({
                ...ref.current,
                queue: [
                  {
                    ...first,
                    idempotencyKey: crypto.randomUUID(),
                    commands: [cmd],
                  },
                  ...ref.current.queue.slice(1),
                ],
                undo: [],
              })
                .then(() => {
                  conflictRef.current = false;
                  setConflict(false);
                  setComparison(null);
                  void flush();
                })
                .catch(() => {});
            }}
          >
            按合并文字重试
          </button>
        </aside>
      )}
      {!readOnly && (
        <div className="content-actions">
          {!!data.undo?.length && (
            <button
              disabled={conflict || !!data.queue.length}
              onClick={() => void enqueue(data.undo!.at(-1)!, (s) => s, true)}
            >
              撤销上次内容修改
            </button>
          )}
          {conflict &&
            data.queue[0]?.commands.length === 1 &&
            data.queue[0]?.commands[0]?.op === "entry.edit" && (
              <button
                onClick={() => {
                  const cmd = data.queue[0]!.commands[0]!;
                  if (cmd.op !== "entry.edit") return;
                  void api<DocumentEntry>(
                    `/worlds/${worldId}/content/entries/${cmd.id}`,
                  )
                    .then((cloud) =>
                      setComparison({
                        local: cmd.text,
                        cloud,
                        merged: cmd.text,
                      }),
                    )
                    .catch((e) => setStatus(e.message));
                }}
              >
                比较本机与云端正文
              </button>
            )}
          <button onClick={() => void flush()} disabled={conflict}>
            重试同步
          </button>
          <button onClick={download}>下载本机救援草稿</button>
          {conflict && (
            <button
              onClick={() => {
                download();
                void persist({ ...ref.current, queue: [] }).then(() => {
                  conflictRef.current = false;
                  setConflict(false);
                  setComparison(null);
                  void list();
                  if (docId) void open(docId);
                });
              }}
            >
              保留救援文件，重新读取云端
            </button>
          )}
        </div>
      )}
    </section>
  );
}
