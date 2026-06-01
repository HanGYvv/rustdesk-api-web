import Websock from '@/utils/webclient/websock'
import * as rendezvous from '@/utils/webclient/rendezvous'
import * as message from '@/utils/webclient/message'
import { ElMessageBox } from 'element-plus'
import { T } from '@/utils/i18n'
import { getToken } from '@/utils/auth'
import { useUserStore } from '@/store/user'
import { useAppStore } from '@/store/app'
import { pinia } from '@/store'

const getAppStore = () => useAppStore(pinia)
const WEBCLIENT_TIMEOUT_MS = 12000

export const getWebClientBaseUrl = () => {
  return getAppStore().setting.rustdeskConfig.api_server || window.location.origin
}

export const toWebClientLink = (row) => {
  window.open(`${getWebClientBaseUrl()}/webclient2/#/${row.id}`, '_blank', 'noopener,noreferrer')
}

// Kept for the web client share flow: it resolves the rendezvous/relay hash pair.
export async function getPeerSlat (id) {
  const app = getAppStore()
  const [addr] = (app.setting.rustdeskConfig.id_server || '').split(':')
  if (!addr) {
    return false
  }

  const scheme = location.protocol === 'https:' ? 'wss' : 'ws'
  const ws = new Websock(`${scheme}://${addr}:21118`, true)
  try {
    await ws.open(WEBCLIENT_TIMEOUT_MS)
    const conn_type = rendezvous.ConnType.DEFAULT_CONN
    const nat_type = rendezvous.NatType.SYMMETRIC
    const token = useUserStore(pinia).token || getToken() || undefined
    const punch_hole_request = rendezvous.PunchHoleRequest.fromPartial({
      id,
      licence_key: app.setting.rustdeskConfig.key || undefined,
      conn_type,
      nat_type,
      token,
    })
    ws.sendRendezvous({ punch_hole_request })
    const msg = await ws.next(WEBCLIENT_TIMEOUT_MS).catch(_ => false)
    if (!msg) {
      ElMessageBox.alert(T('Timeout'), T('Error'))
      return false
    }

    const phr = msg.punch_hole_response
    const rr = msg.relay_response
    if (phr) {
      if (phr.other_failure) {
        ElMessageBox.alert(phr.other_failure, T('Error'))
        return false
      }
      if (phr.failure != rendezvous.PunchHoleResponse_Failure.UNRECOGNIZED) {
        switch (phr.failure) {
          case rendezvous.PunchHoleResponse_Failure.ID_NOT_EXIST:
            ElMessageBox.alert(T('IDNotExist'), T('Error'))
            break
          case rendezvous.PunchHoleResponse_Failure.OFFLINE:
            ElMessageBox.alert(T('RemoteDesktopOffline'), T('Error'))
            break
          case rendezvous.PunchHoleResponse_Failure.LICENSE_MISMATCH:
            ElMessageBox.alert(T('KeyMismatch'), T('Error'))
            break
          case rendezvous.PunchHoleResponse_Failure.LICENSE_OVERUSE:
            ElMessageBox.alert(T('KeyOveruse'), T('Error'))
            break
        }
        return false
      }
      return false
    }
    if (!rr) {
      return false
    }

    const uuid = rr.uuid
    const relayWs = new Websock(`${scheme}://${addr}:21119`, false)
    try {
      await relayWs.open(WEBCLIENT_TIMEOUT_MS)
      const request_relay = rendezvous.RequestRelay.fromPartial({
        licence_key: app.setting.rustdeskConfig.key || undefined,
        uuid,
      })
      relayWs.sendRendezvous({ request_relay })

      //暂不支持pk
      const public_key = message.PublicKey.fromPartial({})
      relayWs.sendMessage({ public_key })
      const relayDeadline = Date.now() + WEBCLIENT_TIMEOUT_MS
      while (true) {
        const remaining = relayDeadline - Date.now()
        if (remaining <= 0) {
          ElMessageBox.alert(T('Timeout'), T('Error'))
          return false
        }
        const relayMsg = await relayWs.next(Math.min(remaining, WEBCLIENT_TIMEOUT_MS)).catch(_ => false)
        if (!relayMsg) {
          ElMessageBox.alert(T('Timeout'), T('Error'))
          return false
        }
        if (relayMsg?.hash) {
          return relayMsg.hash
        }
      }
    } finally {
      relayWs.close()
    }
  } finally {
    ws.close()
  }
}

export function getV2ShareUrl (token) {
  return `${getWebClientBaseUrl()}/webclient2/#/?share_token=${token}`
}
