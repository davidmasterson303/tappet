import { FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import type { AdvisorThread } from '../api/consultant';
import { PAGE_BODY, TARGET_MIN, border, brand, space, surface, text, type } from '../theme';
import Button from './Button';
import Icon from './Icon';
import Working from './Working';

/**
 * The advisor's threads for this car — pick one to reopen, or start a new one.
 *
 * ── 13 Sep · why a sheet, and why now ───────────────────────────────────────
 *
 * David: *"i need some way to toggle between chat threads... or to view other
 * threads and select one to enter, or start new thread."* The screen kept one
 * thread per arrival and the server kept them all; the two routes that list
 * and reopen them have existed since 12 Aug and were called by nothing on the
 * phone (the screen's docblock records the month-long "product call"). This is
 * that call, made.
 *
 * A full-screen sheet in the consent sheet's shape rather than a drawer: the
 * list is the whole task while it is up, and a half-height panel over a
 * transcript is two documents fighting for one screen. The current thread is
 * marked; a thread with no server title falls back to the date it was last
 * touched, so a row is never blank; NEW THREAD is the filled primary because
 * it is the one act that is not a choice among rows.
 *
 * Nothing here decides what a thread contains — the screen loads it and draws
 * it; this only says which.
 */
export default function AdvisorThreadsSheet({
  visible,
  threads,
  loading,
  currentId,
  onPick,
  onNew,
  onClose,
}: {
  visible: boolean;
  threads: AdvisorThread[];
  /** The list is still arriving. */
  loading: boolean;
  /** The thread on screen behind the sheet, if it has an id yet. */
  currentId: string | null;
  onPick: (thread: AdvisorThread) => void;
  onNew: () => void;
  onClose: () => void;
}) {
  return (
    <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={onClose}>
      <View style={styles.root}>
        <View style={styles.bar}>
          <Text accessibilityRole="header" style={styles.title}>
            Threads
          </Text>
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close threads"
            hitSlop={8}
            style={({ pressed }) => [styles.close, pressed && styles.pressed]}
          >
            <Icon name="x" size={18} color={text.primary} />
          </Pressable>
        </View>

        <View style={styles.primary}>
          <Button label="New thread" variant="primary" onPress={onNew} accessibilityLabel="Start a new thread" />
        </View>

        {loading && threads.length === 0 ? (
          <Working variant="compact" line="Loading threads" detail="Everything asked about this car." />
        ) : threads.length === 0 ? (
          <Text style={styles.empty}>Nothing asked about this car yet.</Text>
        ) : (
          <FlatList
            data={threads}
            keyExtractor={(thread) => thread.id}
            contentContainerStyle={styles.list}
            renderItem={({ item }) => {
              const current = item.id === currentId;
              return (
                <Pressable
                  onPress={() => onPick(item)}
                  accessibilityRole="button"
                  accessibilityLabel={`Open thread ${threadLabel(item)}`}
                  accessibilityState={{ selected: current }}
                  style={({ pressed }) => [styles.row, pressed && styles.pressed]}
                >
                  <View style={styles.rowText}>
                    <Text style={[styles.rowTitle, current && styles.rowTitleCurrent]} numberOfLines={2}>
                      {threadLabel(item)}
                    </Text>
                    <Text style={styles.rowMeta}>{current ? 'OPEN NOW' : when(item.updatedAt ?? item.createdAt)}</Text>
                  </View>
                  <Icon name="chevron-right" size={16} color={text.muted} />
                </Pressable>
              );
            }}
          />
        )}
      </View>
    </Modal>
  );
}

/**
 * The server's title, or "Untitled thread" — never blank. The date is the
 * row's meta line already; a fallback that repeated it read "Thread from
 * 11 SEP / 11 SEP" on the simulator.
 */
export function threadLabel(thread: AdvisorThread): string {
  return thread.title ?? 'Untitled thread';
}

/** "12 Sep" — the day, in the chrome's voice; the year only when it is not this one. */
function when(stamp: string | null): string {
  if (!stamp) return '';
  const date = new Date(stamp);
  if (Number.isNaN(date.getTime())) return '';
  const sameYear = date.getFullYear() === new Date().getFullYear();
  /*
    Assembled by hand rather than `toLocaleDateString`: the same call gives
    "Sep" on the phone and "Sept" under jest's ICU, and a label that differs
    by runtime is one the suite cannot pin.
  */
  const month = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'][date.getMonth()];
  return `${date.getDate()} ${month}${sameYear ? '' : ` ${date.getFullYear()}`}`;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: surface.page },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: PAGE_BODY.paddingHorizontal,
    paddingTop: 64,
    paddingBottom: space.md,
  },
  title: { ...type.display, color: text.primary },
  close: { minHeight: TARGET_MIN, minWidth: TARGET_MIN, alignItems: 'center', justifyContent: 'center' },
  pressed: { backgroundColor: surface.raised },
  primary: { paddingHorizontal: PAGE_BODY.paddingHorizontal, paddingBottom: space.md },
  list: { paddingBottom: space.h2 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: 56,
    paddingHorizontal: PAGE_BODY.paddingHorizontal,
    paddingVertical: space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: border.panel,
  },
  rowText: { flex: 1, gap: 2 },
  rowTitle: { ...type.body, color: text.primary },
  rowTitleCurrent: { color: brand.accent },
  rowMeta: { ...type.monoLabel, color: text.muted },
  empty: { ...type.body, color: text.muted, paddingHorizontal: PAGE_BODY.paddingHorizontal },
});
