/**
 * Copyright 2019 Grégory Saive for eVias Services
 *
 * Licensed under the BSD 2-Clause License (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     https://opensource.org/licenses/BSD-2-Clause
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
 * AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
 * IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
 * FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
 * DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
 * SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
 * CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
 * OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
 * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */
import {
    Account,
    Address,
    Deadline,
    NetworkType,
    PlainMessage,
    TransferTransaction,
    TransactionHttp,
    AccountHttp,
    Listener,
    UInt64,
    TransactionMapping,
    Transaction,
    TransactionInfo,
} from 'nem2-sdk';
import {
    uint64 as uint64_lib
} from 'nem2-library';
import {CaseParameters} from './core/CaseParameters';
import {TestCase} from './TestCase';
import {CaseResponse} from './core/CaseResponse';
import {from as observableFrom} from 'rxjs';
import {filter, map, mergeMap} from 'rxjs/operators';

export class UsePrivateNetworkDeadline extends TestCase {

    public readonly title: string = "Use nem2-library deadline network time constant";
    public cntBlocks: number = 0;
    public blockHeights: number[] = [];

    public deadline(deadlineParam: number) {
        const NetworkTime = (new Date()).getTime() - 1459468800000;
        const deadlineValue = deadlineParam || 60 * 60 * 1000;
        return uint64_lib.fromUint(deadlineValue + NetworkTime);
    }

    public execute(params: CaseParameters): any {

        // Arrange
        const endpointUrl = 'http://localhost:3000';
        const listener = new Listener(endpointUrl);
        const transactionHttp = new TransactionHttp(endpointUrl);
        const accountHttp = new AccountHttp(endpointUrl);

        const privKey = '';
        const account = Account.createFromPrivateKey(privKey, NetworkType.MIJIN_TEST);

        // test case report WORKING: dynamic deadline, not using constant
        // nemesis timestamp
        const transferTx_dynamicDeadline = TransferTransaction.create(
            Deadline.create(),
            Address.createFromRawAddress('SDU7Y3ZOH5F2WLXHLXY5AIDIJDBSF6MYYFTMKKQT'),
            [],
            PlainMessage.create('test-dynamic-deadline'),
            NetworkType.MIJIN_TEST,
        );

        // test case report NOT WORKING: static deadline, using constant
        // nemesis timestamp as in nem2-library's deadline() helper
        const transferTx_staticDeadline = TransactionMapping.createFromDTO({
            "transaction": {
                "version": 36867,
                "type": 16724,
                "maxFee": [0, 0],
                "deadline": this.deadline(1000 * 60 * 60 * 24),
                "recipient": Address.createFromRawAddress('SDU7Y3ZOH5F2WLXHLXY5AIDIJDBSF6MYYFTMKKQT'),
                "message": {
                    "type": 0,
                    "payload": "test-static-deadline"
                },
                "mosaics": []
            }
        });

        // sign transactions
        const signedTransaction_dynamicDeadline = account.sign(transferTx_dynamicDeadline);
        const signedTransaction_staticDeadline = account.sign(transferTx_staticDeadline);

        let testCase_hash_dynamicDeadline = '';
        let testCase_hash_staticDeadline = '';

        // announce/broadcast transaction
        transactionHttp.announce(signedTransaction_dynamicDeadline).subscribe(() => {
            console.log("Transaction 1 announced!");
            console.log("Hash: ", signedTransaction_dynamicDeadline.hash);

            testCase_hash_dynamicDeadline = signedTransaction_dynamicDeadline.hash;
        });

        transactionHttp.announce(signedTransaction_staticDeadline).subscribe(() => {
            console.log("Transaction 2 announced!");
            console.log("Hash: ", signedTransaction_staticDeadline.hash);

            testCase_hash_staticDeadline = signedTransaction_staticDeadline.hash;
        });

        console.log("Now waiting for blocks..");

        // Listen to blocks to check test case
        listener.open().then(() => {

            // listen to transaction status
            listener.status(account.address)
                .subscribe(error => {
                    let err = "[ERROR] Error: ";
                    console.log(err, error);
                },
                error => console.error(error));

            // get 3 blocks, then check if transactions were confirmed
            let observer = listener.newBlock().subscribe(async (block: any) => {

                console.log("");
                console.log("A new block has arrived (#" + block.height.compact() + ")!");

                this.blockHeights.push(block.height.compact());
                this.cntBlocks++;

                console.log("I now have " + this.cntBlocks + " blocks.");

                if (this.cntBlocks < 3) {
                    return ;
                }

                observer.unsubscribe();

                //XXX test case Checks
                console.log("");
                console.log("I got 3 blocks and will now check confirmed transactions...");

                // check for confirmed transactions
                const confirmedTxes = await accountHttp.transactions(account.publicAccount).toPromise();

                // keep only relevant transactions
                const filteredTxes = confirmedTxes.filter((confirmedTx, index: number) => {
                    const info = confirmedTx.transactionInfo as TransactionInfo;
                    return info.hash === testCase_hash_dynamicDeadline
                        || info.hash === testCase_hash_staticDeadline
                });

                if (filteredTxes.length !== 2) {
                    console.log("TEST CASE RESULT [FAILURE]: Less than 2 transactions were confirmed.");
                    console.log("CONFIRMED COUNT: ", filteredTxes.length);
                }
                else {
                    console.log("TEST CASE RESULT [SUCCESS]: Both transactions have confirmed correctly.");
                    console.log("CONFIRMED COUNT: ", filteredTxes.length);
                }

                listener.close();
            });
        });
    }
}
