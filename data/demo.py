# !/usr/bin/env python
# -*- coding: utf-8 -*-
# ------------------------------
''''''
import json
import csv
import requests
import time
from lxml import etree
f = open('京东.csv', mode='a', encoding='utf-8-sig', newline='')
csv.writer = csv.writer(f)
csv.writer.writerow(['用户名',
                    '评论内容',
                    '时间',
                    '商品标签'
                ])
cookies = {
    'cna': 'nwQeImbxfB0CAW8BYXLOWm5j',
    'xlly_s': '1',
    'dnk': 'tb763343101',
    'tracknick': 'tb763343101',
    'lid': 'tb763343101',
    '_l_g_': 'Ug%3D%3D',
    'unb': '4036583552',
    'lgc': 'tb763343101',
    'cookie1': 'UoLZVG3clnxoEUJ7RjvtDb4PNEWjG6mrMOPsCDK0OmU%3D',
    'login': 'true',
    'wk_cookie2': '15da1fde079d4c187232b0f93d471a75',
    'cookie17': 'VyySWCa9klhZZw%3D%3D',
    'cookie2': '156b27cbeea137420eb86965d2f919f5',
    '_nk_': 'tb763343101',
    'sgcookie': 'E100lrJhPniTLxo%2BGQoRvwdAOjSOounWwVHyax8OnqOi4DDuHYbT0t2GQ50VfUKblXriWAnN05LNY0VUCdOioo9c%2FgkRwwGp4XZMSLz0PPAgFDc%3D',
    'cancelledSubSites': 'empty',
    'sg': '121',
    't': 'cfa1ab00a0a45873bb361fd1e0f51fef',
    'csg': '760319f7',
    'sn': '',
    '_tb_token_': '7e35e413d5e3e',
    'wk_unb': 'VyySWCa9klhZZw%3D%3D',
    'isg': 'BJ-fok6-CsHrIQ7dN7wAWDydLvMpBPOmZyKwAjHsO86VwL9COdSD9h0DgFC-2Mse',
    'mtop_partitioned_detect': '1',
    '_m_h5_tk': '6427803d0780db158b7cfb4a485cec8e_1771519859269',
    '_m_h5_tk_enc': '00bc144e51fa2ea4eb602579cc272027',
    'havana_sdkSilent': '1771538220728',
    'uc1': 'cookie21',
    'uc3': 'nk2',
    'uc4': 'nk4',
    'havana_lgc_exp': '1802613420729',
    'tfstk': 'gVzoeWOZzuoWnxpVSpu5c5HES9jYn4gIKJLKp2HF0xkbJuHdVwfnn5oRNJeLmv24nYP-p_a3m8NZ2JVCNXkULJDL2iQTN7gI8OHhWNFWWRqmBkYrY6kqtXCxa3n8sduI8OB9Deo5S2wknpvxLS5m9XGe4JoruxlI3X-r8Jkq0fl9U2uULsDqTf8yYX8E3xlE3vuEYJR2gxGn8byE8sVqhXlcVHMgFRUVI-iw_4mVo8coqAPrU7FzuBgMVWH0nSzjZS4Qa3Te8rcoqrvjN8wx2kPsfzFR-Eg8souqZJ7NUqPam5nurOY-dD40Ek2R9HG0xWzsPVAFzS0oEczoVC53QSVUXm4A_NgozYrKPWdGeS4ue7a09B-qr4Emjz0N5LkLD54nty6CoRVzbJrh4fx2bM66Rj5LuHtI4jGmBh6cU7_zp89Aisx1u0ljNZfciHtI4jGmBsfDbnorGb_c.',
}

headers = {
    'accept': '*/*',
    'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8,en-GB;q=0.7,en-US;q=0.6',
    'referer': 'https://detail.tmall.com/',
    'sec-ch-ua': '"Not:A-Brand";v="99", "Microsoft Edge";v="145", "Chromium";v="145"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"Windows"',
    'sec-fetch-dest': 'script',
    'sec-fetch-mode': 'no-cors',
    'sec-fetch-site': 'same-site',
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36 Edg/145.0.0.0',
    # 'cookie': 'cna=nwQeImbxfB0CAW8BYXLOWm5j; xlly_s=1; dnk=tb763343101; tracknick=tb763343101; lid=tb763343101; _l_g_=Ug%3D%3D; unb=4036583552; lgc=tb763343101; cookie1=UoLZVG3clnxoEUJ7RjvtDb4PNEWjG6mrMOPsCDK0OmU%3D; login=true; wk_cookie2=15da1fde079d4c187232b0f93d471a75; cookie17=VyySWCa9klhZZw%3D%3D; cookie2=156b27cbeea137420eb86965d2f919f5; _nk_=tb763343101; sgcookie=E100lrJhPniTLxo%2BGQoRvwdAOjSOounWwVHyax8OnqOi4DDuHYbT0t2GQ50VfUKblXriWAnN05LNY0VUCdOioo9c%2FgkRwwGp4XZMSLz0PPAgFDc%3D; cancelledSubSites=empty; sg=121; t=cfa1ab00a0a45873bb361fd1e0f51fef; csg=760319f7; sn=; _tb_token_=7e35e413d5e3e; wk_unb=VyySWCa9klhZZw%3D%3D; isg=BJ-fok6-CsHrIQ7dN7wAWDydLvMpBPOmZyKwAjHsO86VwL9COdSD9h0DgFC-2Mse; mtop_partitioned_detect=1; _m_h5_tk=6427803d0780db158b7cfb4a485cec8e_1771519859269; _m_h5_tk_enc=00bc144e51fa2ea4eb602579cc272027; havana_sdkSilent=1771538220728; uc1=cookie21; uc3=nk2; uc4=nk4; havana_lgc_exp=1802613420729; tfstk=gVzoeWOZzuoWnxpVSpu5c5HES9jYn4gIKJLKp2HF0xkbJuHdVwfnn5oRNJeLmv24nYP-p_a3m8NZ2JVCNXkULJDL2iQTN7gI8OHhWNFWWRqmBkYrY6kqtXCxa3n8sduI8OB9Deo5S2wknpvxLS5m9XGe4JoruxlI3X-r8Jkq0fl9U2uULsDqTf8yYX8E3xlE3vuEYJR2gxGn8byE8sVqhXlcVHMgFRUVI-iw_4mVo8coqAPrU7FzuBgMVWH0nSzjZS4Qa3Te8rcoqrvjN8wx2kPsfzFR-Eg8souqZJ7NUqPam5nurOY-dD40Ek2R9HG0xWzsPVAFzS0oEczoVC53QSVUXm4A_NgozYrKPWdGeS4ue7a09B-qr4Emjz0N5LkLD54nty6CoRVzbJrh4fx2bM66Rj5LuHtI4jGmBh6cU7_zp89Aisx1u0ljNZfciHtI4jGmBsfDbnorGb_c.',
}

params = {
    'jsv': '2.7.5',
    'appKey': '12574478',
    't': '1771510011132',
    'sign': '264e37a64ce0bf16063f6f5b9e3a9999',
    '_bx-login': 'new',
    'api': 'mtop.taobao.rate.detaillist.get',
    'v': '6.0',
    'isSec': '0',
    'ecode': '1',
    'timeout': '20000',
    'dataType': 'jsonp',
    'valueType': 'string',
    'type': 'jsonp',
    'callback': 'mtopjsonp17',
    'data': '{"showTrueCount":false,"auctionNumId":"999664573819","pageNo":2,"pageSize":20,"orderType":"","searchImpr":"-8","expression":"","skuVids":"","rateSrc":"pc_rate_list","rateType":"","foldFlag":"0"}',
}

response = requests.get(
    'https://h5api.m.tmall.com/h5/mtop.taobao.rate.detaillist.get/6.0/',
    params=params,
    cookies=cookies,
    headers=headers,
).json()
for li in response['data']['rateList']:
    dict = {
        '用户名' : li['userNick'],
        '评论内容' : li['feedback'],
        '时间' : li['feedbackDate'],
        '商品标签' : li['skuMap'],
    }
    print(dict)
    csv.writer.writerow([li['userNick'],li['feedback'],li['feedbackDate'],li['skuMap']])