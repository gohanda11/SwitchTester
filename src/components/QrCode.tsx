import { useEffect, useState } from 'react'
import QRCode from 'qrcode'

export function QrCode({ value, size = 200 }: { value: string; size?: number }) {
  const [src, setSrc] = useState<string>('')

  useEffect(() => {
    let cancelled = false
    if (!value) {
      setSrc('')
      return
    }
    QRCode.toDataURL(value, {
      width: size,
      margin: 1,
      color: { dark: '#071018', light: '#ffffff' },
      errorCorrectionLevel: 'M',
    }).then((url) => {
      if (!cancelled) setSrc(url)
    })
    return () => {
      cancelled = true
    }
  }, [value, size])

  if (!value) {
    return (
      <div className="qr-wrap qr-empty">
        <p className="qr-caption">購入URL未設定</p>
      </div>
    )
  }

  return (
    <div className="qr-wrap">
      {src ? (
        <img src={src} alt="購入先QRコード" width={size} height={size} />
      ) : (
        <div className="qr-skel" style={{ width: size, height: size }} />
      )}
      <p className="qr-caption">購入はこちら</p>
    </div>
  )
}
