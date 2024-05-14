import base64
import boto3
import json
import urllib
from botocore.auth import SigV4Auth
from botocore.awsrequest import AWSRequest

# initialization
session = boto3.session.Session()
credentials = session.get_credentials().get_frozen_credentials()

# helper functions
# attribution: https://medium.com/@dario_26152/restrict-access-to-lambda-functionurl-to-cloudfront-using-aws-iam-988583834705
# attribution: https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/lambda-examples.html#lambda-examples-access-request-body-examples
def sign_request(request):
    print(json.dumps(request))
    # process headers
    headers = request['headers']
    url = f"https://{headers['host'][0]['value']}{request['uri']}"
    segments = urllib.parse.urlparse(url).netloc.split('.')
    region = segments[2]
    method = request['method']
    # truncate header data structure
    headers = {v[0]['key']:v[0]['value'] for k,v in headers.items()}
    headers.pop('X-Forwarded-For')
    # prep data for signing the request
    data = base64.b64decode(request['body']['data']) if method == "POST" and "body" in request else None
    # sign the request
    req = AWSRequest(method=method, url=url, params=None, headers=headers, data=data)
    SigV4Auth(credentials, 'lambda', region).add_auth(req)
    signed_headers=dict(req.headers.items())
    # update the request with signed headers
    request['headers'] = { k.lower():[{'key':k,'value':v}] for k,v in signed_headers.items() }
    return request

# main handler
def handler(event, context):
    request = event['Records'][0]['cf']['request']
    signed_request = sign_request(request)
    return signed_request