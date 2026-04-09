import { StyleSheet } from '@react-pdf/renderer'

export const colors = {
  primary: '#2563eb',
  slate900: '#0f172a',
  slate700: '#334155',
  slate500: '#64748b',
  slate400: '#94a3b8',
  slate200: '#e2e8f0',
  slate100: '#f1f5f9',
  slate50: '#f8fafc',
  green700: '#15803d',
  green50: '#f0fdf4',
  amber700: '#b45309',
  amber50: '#fffbeb',
  red700: '#b91c1c',
  red50: '#fef2f2',
  violet700: '#6d28d9',
  violet50: '#f5f3ff',
}

export const base = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    fontSize: 10,
    color: colors.slate900,
    paddingTop: 40,
    paddingBottom: 50,
    paddingHorizontal: 40,
  },
  h1: {
    fontSize: 20,
    fontFamily: 'Helvetica-Bold',
    color: colors.slate900,
    marginBottom: 4,
  },
  h2: {
    fontSize: 13,
    fontFamily: 'Helvetica-Bold',
    color: colors.slate900,
    marginBottom: 6,
    marginTop: 14,
  },
  h3: {
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
    color: colors.slate700,
    marginBottom: 4,
  },
  label: {
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    color: colors.slate500,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 3,
  },
  text: {
    fontSize: 10,
    color: colors.slate700,
    lineHeight: 1.5,
  },
  small: {
    fontSize: 8,
    color: colors.slate500,
  },
  divider: {
    borderBottom: `1pt solid ${colors.slate200}`,
    marginVertical: 10,
  },
  badge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
  },
  card: {
    borderRadius: 6,
    border: `1pt solid ${colors.slate200}`,
    padding: 10,
    marginBottom: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  footer: {
    position: 'absolute',
    bottom: 24,
    left: 40,
    right: 40,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
})
