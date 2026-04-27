import path from 'path'
import { Font } from '@react-pdf/renderer'

const fontDir = path.join(process.cwd(), 'src', 'lib', 'pdf', 'assets', 'fonts')

Font.register({
  family: 'Inter',
  fonts: [
    { src: path.join(fontDir, 'Inter-Regular.ttf'), fontWeight: 400 },
    { src: path.join(fontDir, 'Inter-Medium.ttf'), fontWeight: 500 },
    { src: path.join(fontDir, 'Inter-SemiBold.ttf'), fontWeight: 600 },
    { src: path.join(fontDir, 'Inter-Bold.ttf'), fontWeight: 700 },
  ],
})
