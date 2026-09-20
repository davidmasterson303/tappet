import { Component, type ErrorInfo, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Constants from 'expo-constants';
import Button from './Button';
import { reportClientError } from '../api/client-errors';
import { space, surface, text, type } from '../theme';

/**
 * The last thing standing when a screen throws.
 *
 * ── Why this exists (QE 1.4, 20 Sep) ────────────────────────────────────────
 *
 * There was no error boundary anywhere in the app. A render exception on
 * any screen — one NHTSA record with an unexpected shape, one new API field
 * a parser did not expect — was an uncaught JS error, which in a release
 * build is the app closing to the home screen (Guideline 2.1) with nothing
 * said to the owner and nothing said to us. Two things follow from that,
 * and this component is both:
 *
 * 1. **The owner sees a sentence and a way on**, not the home screen. The
 *    boundary renders in place of the whole tree, says what happened in the
 *    app's own voice, and offers "Try again", which remounts the tree. Their
 *    session is untouched; the garage is where it was.
 * 2. **We hear about it.** There is no crash-reporting SDK in this app — a
 *    native module, which is a build (CLAUDE.md §9) and a decision. Until
 *    there is one, the boundary posts the error to `/api/v1/client-errors`,
 *    which logs it where the function logs are read. A crash nobody can see
 *    is the class of defect this codebase is written against.
 *
 * ── What it deliberately does not do ────────────────────────────────────────
 *
 * It does not retry on its own, does not hide the error behind a spinner,
 * and does not pretend the screen loaded. A blank screen that recovers by
 * itself would be a crash with the evidence removed.
 */

interface Props {
  children: ReactNode;
  /** Where the tree was, for the report. */
  where?: string;
}

interface State {
  error: Error | null;
}

export default class CrashBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Best-effort and never awaited; a report that fails changes nothing here.
    void reportClientError({
      message: error.message,
      stack: error.stack ?? null,
      componentStack: info.componentStack ?? null,
      where: this.props.where ?? 'root',
      version: Constants.expoConfig?.version ?? null,
    });
  }

  private reset = () => {
    this.setState({ error: null });
  };

  render() {
    if (this.state.error === null) return this.props.children;
    return (
      <View style={styles.root} accessibilityRole="alert">
        <Text style={styles.title}>Something went wrong</Text>
        <Text style={styles.body}>
          This screen hit an error it could not recover from. Your cars and records are not
          affected — this has been reported, and trying again reloads the screen.
        </Text>
        <Button label="Try again" onPress={this.reset} />
      </View>
    );
  }
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: surface.page,
    justifyContent: 'center',
    padding: space.h1,
    gap: space.lg,
  },
  title: { ...type.title, color: text.primary },
  body: { ...type.body, color: text.secondary },
});
