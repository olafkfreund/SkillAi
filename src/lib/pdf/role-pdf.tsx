import React from 'react'
import {
  Document,
  Page,
  Text,
  View,
} from '@react-pdf/renderer'
import { base, colors } from './styles'
import type { roles } from '@/db/schema'

type Role = typeof roles.$inferSelect

type Props = { role: Role }

export function RolePDF({ role }: Props) {
  return (
    <Document title={`Role — ${role.title}`}>
      <Page size="A4" style={base.page}>
        <Text style={base.h1}>{role.title}</Text>
        <Text style={{ ...base.small, marginBottom: 16 }}>
          Created {new Date(role.createdAt).toLocaleDateString()}
          {role.isActive ? '' : ' · Archived'}
        </Text>

        <View style={base.divider} />

        <Text style={base.h2}>Description</Text>
        <Text style={{ ...base.text, marginBottom: 16 }}>{role.description}</Text>

        <Text style={base.h2}>Requirements</Text>
        <Text style={base.text}>{role.requirements}</Text>

        {/* Footer */}
        <View style={base.footer} fixed>
          <Text style={base.small}>SkillAI — Confidential</Text>
          <Text style={{ ...base.small, color: colors.slate400 }}>
            {new Date().toLocaleDateString()}
          </Text>
        </View>
      </Page>
    </Document>
  )
}
