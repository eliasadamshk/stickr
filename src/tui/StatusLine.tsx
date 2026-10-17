import { Text } from 'ink';

export interface Status {
	kind: 'info' | 'success' | 'error';
	text: string;
}

const COLORS = { info: 'gray', success: 'green', error: 'red' } as const;

export function StatusLine({ status }: { status?: Status }) {
	if (!status) return <Text> </Text>;
	return (
		<Text color={COLORS[status.kind]} wrap="truncate">
			{status.kind === 'error' ? '✗ ' : status.kind === 'success' ? '✓ ' : ''}
			{status.text}
		</Text>
	);
}
