sap.ui.define([
	"zgpms/meilpower/com/controller/BaseController",
	"sap/ui/model/json/JSONModel",
	"sap/m/MessageBox",
	"sap/m/MessageToast"
], function (BaseController, JSONModel, MessageBox, MessageToast) {
	"use strict";

	return BaseController.extend("zgpms.meilpower.com.controller.InwardGatePass", {
		onInit: function () {
			this._resetModel();
			this.getRouter().getRoute("InwardGatePass").attachPatternMatched(this._onRouteMatched, this);
		},

		_onRouteMatched: function (oEvent) {
			this._resetModel();
			var sGPNo = oEvent.getParameter("arguments").gpNo;
			if (sGPNo) {
				this._loadByGPNo(sGPNo);
			}
		},

		_resetModel: function () {
			this._rawHeader = null;
			var oData = {
				GatePassNo: "",
				DueDate: "",
				RevisedDueDate: "",
				ReceivedDate: null,
				Plant: "",
				Department: "",
				VendorName: "",
				VendorGST: "",
				items: [],
				showLogistics: false,
				DocOptionIndex: 0,
				Status: "OPEN",
				CommentsList: [],
				TransporterName: "",
				TransporterGST: "",
				DCNotes: "",
				VehicleNo: "",
				ModeOfTransport: "Road",
				TransportByIndex: 1,
				GateEntryNo: "",
				EWayBillNo: "",
				EWayBillDate: null,
				FinalTotal: "0.00"
			};
			var oModel = this.getView().getModel("inward");
			if (oModel) {
				oModel.setData(oData);
			} else {
				this.getView().setModel(new JSONModel(oData), "inward");
			}
		},

		_formatDate: function (vDate) {
			if (!vDate || vDate === "00000000" || vDate === "") { return ""; }
			// Handle OData /Date(ms)/ format
			if (typeof vDate === "string" && vDate.indexOf("/Date(") === 0) {
				var ms = parseInt(vDate.replace(/\/Date\((\d+)[^)]*\)\//, "$1"), 10);
				vDate = new Date(ms);
			}
			// Handle YYYYMMDD string (e.g. "20260504")
			if (typeof vDate === "string" && /^\d{8}$/.test(vDate)) {
				vDate = new Date(vDate.slice(0, 4), parseInt(vDate.slice(4, 6), 10) - 1, vDate.slice(6, 8));
			}
			if (vDate instanceof Date && !isNaN(vDate)) {
				return vDate.toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" }).split("/").join("-");
			}
			return String(vDate);
		},

		_formatDateForPayload: function (sDate) {
			if (!sDate) { return ""; }
			// If already YYYY-MM-DD
			if (/^\d{4}-\d{2}-\d{2}$/.test(sDate)) { return sDate; }
			// If DD-MM-YYYY, convert to YYYY-MM-DD
			if (/^\d{2}-\d{2}-\d{4}$/.test(sDate)) {
				var parts = sDate.split("-");
				return parts[2] + "-" + parts[1] + "-" + parts[0];
			}
			return sDate;
		},

		onSearchRGP: function (oEvent) {
			var sQuery = oEvent.getParameter("query");
			if (!sQuery) { return; }
			this._resetModel();
			this._loadByGPNo(sQuery);
		},

		_loadByGPNo: function (sGPNo) {
			var oODataModel = this.getOwnerComponent().getModel();
			if (!oODataModel) {
				MessageBox.error("Backend OData service not connected.");
				return;
			}

			sap.ui.core.BusyIndicator.show(0);

			oODataModel.read("/GatePassHDRSet", {
				filters: [new sap.ui.model.Filter("GatePassNo", sap.ui.model.FilterOperator.EQ, sGPNo)],
				urlParameters: { "$expand": "GatePassItemNav" },
				success: function (oData) {
					sap.ui.core.BusyIndicator.hide();
					var oResult = oData.results && oData.results[0];
					if (!oResult) {
						MessageBox.error("RGP Gate Pass " + sGPNo + " not found.");
						return;
					}
					if (oResult.GatePassType !== "RGP") {
						MessageBox.warning("This is an NRGP Gate Pass. Inward is only for RGP.");
						return;
					}
					this._mapData(oResult);
				}.bind(this),
				error: function () {
					sap.ui.core.BusyIndicator.hide();
					MessageBox.error("Error fetching Gate Pass data.");
				}
			});
		},

		_mapData: function (oData) {
			this._rawHeader = oData;
			var oModel = this.getView().getModel("inward");
			var aItems = (oData.GatePassItemNav && oData.GatePassItemNav.results) || [];

			var sFullyReceivedMsg = "";
			var aMapped = aItems.map(function (item) {
				var fSent = parseFloat(item.SentQuantity || item.Quantity || 0);
				var fRec  = parseFloat(item.RecievedQuantity || 0);
				var fBal  = parseFloat(item.BalanceQuantity);

				// If balance is 0 or NaN but nothing has been received yet, 
				// it means it's a new Gate Pass and balance should equal sent quantity.
				if ((isNaN(fBal) || (fBal === 0 && fRec === 0)) && fSent > 0) {
					fBal = fSent;
				}

				if (fBal === 0 && fSent > 0) {
					sFullyReceivedMsg = item.Message || "All items for Gate Pass " + (oData.GatePassNo || "") + " have already been received.";
				}

				return {
					// display fields
					material:     item.Material || "",
					materialName: item.Description || item.MaterialName || "",
					sentQty:      fSent,
					recvdQty:     0,
					balQty:       parseFloat(fBal.toFixed(3)),
					_initialBal:  parseFloat(fBal.toFixed(3)),
					uom:          item.UOM || item.Uom || "EA",
					// raw fields needed for POST
					_itemNo:        item.ItemNo || "",
					_itemNetPrice:  item.ItemNetPrice || "0.00",
					_totalValue:    item.Totalvalue || "0.00",
					_gatePassReqNo: item.GatePassReqNo || "",
					_itemRemarks:   item.Remarks || ""
				};
			});

			if (sFullyReceivedMsg) {
				MessageBox.warning(sFullyReceivedMsg);
			}

			oModel.setProperty("/GatePassNo",     oData.GatePassNo || "");
			oModel.setProperty("/GatePassDate",   this._formatDate(oData.GatePassDate));
			oModel.setProperty("/DueDate",        this._formatDate(oData.ReturnableDate || oData.DueDate));
			oModel.setProperty("/RevisedDueDate", this._formatDate(oData.Extreturndate || oData.ExtendedReturnableDate));
			oModel.setProperty("/ReceivedDate",   null);
			oModel.setProperty("/Plant",          oData.Plant || "");
			oModel.setProperty("/Department",     oData.Department || "");
			oModel.setProperty("/VendorName",     oData.VendorName || "");
			oModel.setProperty("/VendorGST",      oData.VendorGST || "");
			oModel.setProperty("/items",          aMapped);
			oModel.setProperty("/showLogistics",  true);
			this._calculateFinalTotal();
		},

		onQtyChange: function (oEvent) {
			var oSource  = oEvent.getSource();
			var oContext = oSource.getBindingContext("inward");
			var oItem    = oContext.getObject();
			var oModel   = this.getView().getModel("inward");

			var fNow     = parseFloat(oSource.getValue() || 0);

			// Manually sync the typed value to the model for real-time total calculation
			oModel.setProperty(oContext.getPath() + "/recvdQty", fNow);

			var fInitial = parseFloat(oItem._initialBal || oItem.sentQty || 0);
			var fBal     = parseFloat((fInitial - fNow).toFixed(3));

			if (fBal < 0) {
				MessageToast.show("Received quantity exceeds the available balance!");
				oSource.setValueState("Error");
			} else {
				oSource.setValueState("None");
			}

			oModel.setProperty(oContext.getPath() + "/balQty", fBal);
			this._calculateFinalTotal();
		},

		_calculateFinalTotal: function () {
			var oModel = this.getView().getModel("inward");
			var aItems = oModel.getProperty("/items") || [];
			var fTotal = aItems.reduce(function (sum, item) {
				var fQty = parseFloat(item.recvdQty || 0);
				var fRate = parseFloat(item._itemNetPrice || 0);
				return sum + (fQty * fRate);
			}, 0);
			oModel.setProperty("/FinalTotal", fTotal.toLocaleString('en-IN', {
				minimumFractionDigits: 2,
				maximumFractionDigits: 2
			}));
		},

		onAddComment: function () {
			var oModel = this.getView().getModel("inward");
			var aComments = oModel.getProperty("/CommentsList") || [];
			var sDate = new Date().toLocaleDateString("en-GB").split("/").join("-");

			aComments.push({
				text: "",
				date: sDate
			});
			oModel.setProperty("/CommentsList", aComments);
		},

		onDeleteComment: function (oEvent) {
			var oItem = oEvent.getSource().getParent();
			var oTable = oItem.getParent();
			var iIndex = oTable.indexOfItem(oItem);

			var oModel = this.getView().getModel("inward");
			var aComments = oModel.getProperty("/CommentsList");
			aComments.splice(iIndex, 1);
			oModel.setProperty("/CommentsList", aComments);
		},

		onDocOptionChange: function () {
			// Handled via XML binding
		},

		onPostInward: function () {
			var oModel   = this.getView().getModel("inward");
			var aItems   = oModel.getProperty("/items");
			var oHdr     = this._rawHeader || {};

			var bValid = aItems.some(function (it) { return parseFloat(it.recvdQty) > 0; });
			if (!bValid) {
				MessageBox.warning("Please enter received quantity for at least one item.");
				return;
			}

			var sGatePassNo = oModel.getProperty("/GatePassNo");

			var aNavItems = aItems.map(function (it) {
				return {
					GatePassType:       "RGP",
					GatePassNo:         sGatePassNo,
					ItemNo:             it._itemNo,
					Material:           it.material,
					Description:        it.materialName,
					UOM:                it.uom,
					ItemNetPrice:       it._itemNetPrice,
					SentQuantity:       parseFloat(it.sentQty).toFixed(3),
					RecievedQuantity:   parseFloat(it.recvdQty).toFixed(3),
					BalanceQuantity:    parseFloat(it.balQty).toFixed(3),
					Totalvalue:         it._totalValue,
					GatePassReqNo:      it._gatePassReqNo,
					Remarks:            it._itemRemarks
				};
			});

			var oPayload = {
				GatePassType:    "RGP",
				GatePassNo:      sGatePassNo,
				Plant:           oHdr.Plant           || "",
				Vendor:          oHdr.Vendor          || "",
				VendorName:      oHdr.VendorName      || "",
				ZipCode:         oHdr.ZipCode         || "",
				City:            oHdr.City            || "",
				// GatePassDate:    oHdr.GatePassDate    || "",
				PurchasingDoc:   oHdr.PurchasingDoc   || "",
				ChallanDate:     oHdr.ChallanDate     || "",
				GateEntryNo:     oHdr.GateEntryNo     || "",
				Extreturndate:   this._formatDateForPayload(oModel.getProperty("/RevisedDueDate")) || "",
				RecievedDate:    this._formatDateForPayload(oModel.getProperty("/ReceivedDate")) || "",
				ReturnableDate:  oHdr.ReturnableDate  || "",
				Department:      oHdr.Department      || "",
				ChallanNumber:   oHdr.ChallanNumber   || "",
				GateExitdate:    oHdr.GateExitdate    || "",
				ReqEmpID:        oHdr.ReqEmpID        || "",
				FinanceHODId:    oHdr.FinanceHODId    || "",
				PlantHODId:      oHdr.PlantHODId      || "",
				StoreHODId:      oHdr.StoreHODId      || "",
				HODEmpID:        oHdr.HODEmpID        || "",
				Remarks:         oModel.getProperty("/DCNotes") || oHdr.Remarks || "",
				VehicleNo:       oModel.getProperty("/VehicleNo") || "",
				ModeOfDispatch:  oModel.getProperty("/ModeOfTransport") || "",
				GateRetItmNav:   aNavItems
			};

			var oODataModel = this.getOwnerComponent().getModel();
			sap.ui.core.BusyIndicator.show(0);

			oODataModel.create("/GateRetHdrSet", oPayload, {
				success: function (oResponse) {
					sap.ui.core.BusyIndicator.hide();
					var sMsg = oResponse.Message || "Inward Gate Pass posted successfully!";
					MessageBox.success(sMsg, {
						onClose: function () {
							this.getView().getModel("inward").setProperty("/showLogistics", true);
						}.bind(this)
					});
				}.bind(this),
				error: function (oError) {
					sap.ui.core.BusyIndicator.hide();
					var sMsg = "";
					try { sMsg = JSON.parse(oError.responseText).error.message.value; } catch (e) { sMsg = oError.message || "Unknown error"; }
					MessageBox.error("Failed to post Inward Gate Pass:\n" + sMsg);
				}
			});
		},

		onNavHome: function () {
			this.getRouter().navTo("home");
		},

		_getImageBase64: function (url) {
			return new Promise(function (resolve, reject) {
				var img = new Image();
				img.crossOrigin = "Anonymous";
				img.onload = function () {
					var canvas = document.createElement('canvas');
					canvas.width = img.width;
					canvas.height = img.height;
					var ctx = canvas.getContext('2d');
					ctx.drawImage(img, 0, 0);
					resolve(canvas.toDataURL('image/png'));
				};
				img.onerror = function (err) {
					reject(err);
				};
				img.src = url;
			});
		},

		_numberToWords: function (num) {
			var a = ['', 'One ', 'Two ', 'Three ', 'Four ', 'Five ', 'Six ', 'Seven ', 'Eight ', 'Nine ', 'Ten ', 'Eleven ', 'Twelve ', 'Thirteen ', 'Fourteen ', 'Fifteen ', 'Sixteen ', 'Seventeen ', 'Eighteen ', 'Nineteen '];
			var b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
			if ((num = num.toString()).length > 9) return 'overflow';
			var n = ('000000000' + num).substr(-9).match(/^(\d{2})(\d{2})(\d{2})(\d{1})(\d{2})$/);
			if (!n) return '';
			var str = '';
			str += (n[1] != 0) ? (a[Number(n[1])] || b[n[1][0]] + ' ' + a[n[1][1]]) + 'Crore ' : '';
			str += (n[2] != 0) ? (a[Number(n[2])] || b[n[2][0]] + ' ' + a[n[2][1]]) + 'Lakh ' : '';
			str += (n[3] != 0) ? (a[Number(n[3])] || b[n[3][0]] + ' ' + a[n[3][1]]) + 'Thousand ' : '';
			str += (n[4] != 0) ? (a[Number(n[4])] || b[n[4][0]] + ' ' + a[n[4][1]]) + 'Hundred ' : '';
			str += (n[5] != 0) ? ((str != '') ? 'and ' : '') + (a[Number(n[5])] || b[n[5][0]] + ' ' + a[n[5][1]]) : '';
			return str;
		},

		onPrintGatePass: async function () {
			var oInward = this.getView().getModel("inward").getData();
			const { jsPDF } = window.jspdf;
			var doc = new jsPDF('p', 'mm', 'a4');
			var pageWidth = doc.internal.pageSize.width;
			var margin = 12;
			var sDate = new Date().toLocaleDateString('en-GB').split('/').join('-');

			// Header
			var sLogoUrl = sap.ui.require.toUrl("zgpms/meilpower/com/images/meil_logo.png");
			try {
				var sLogoBase64 = await this._getImageBase64(sLogoUrl);
				doc.addImage(sLogoBase64, 'PNG', margin, 10, 35, 12);
			} catch (e) {
				doc.setFont("helvetica", "bold"); doc.setFontSize(22); doc.setTextColor(204, 32, 32); doc.text("MEIL", margin, 20);
			}

			doc.setFontSize(16); doc.setTextColor(0, 0, 0); doc.setFont("helvetica", "bold");
			doc.text("MEIL Neyveli Energy Private Limited", pageWidth / 2 + 10, 18, { align: "center" });
			doc.setFontSize(7); doc.setFont("helvetica", "normal");
			doc.text("250 MW LFPP, Uttangal, Neyveli, Tamilnadu - 607804, India", pageWidth / 2 + 10, 25, { align: "center" });
			
			doc.setFontSize(10); doc.setFont("helvetica", "bold");
			doc.text("INWARD GATE PASS (RECEIPT)", pageWidth / 2, 38, { align: "center" });
			doc.line(pageWidth / 2 - 40, 39, pageWidth / 2 + 40, 39);

			var y = 48; doc.setFontSize(9);
			doc.text("Ref RGP No: " + (oInward.GatePassNo || ""), margin, y);
			doc.text("Inward Date:", 140, y); doc.setFont("helvetica", "normal"); doc.text(sDate, 165, y);

			y += 10; doc.setFont("helvetica", "bold");
			doc.text("Vendor:", margin, y); doc.setFont("helvetica", "normal"); doc.text(oInward.VendorName || "", margin + 20, y);
			
			y += 10;
			var tableData = (oInward.items || []).filter(it => parseFloat(it.recvdQty) > 0).map(function (it, i) {
				var fQty = parseFloat(it.recvdQty) || 0;
				var fRate = parseFloat(it._itemNetPrice) || 0;
				var fAmt = fQty * fRate;
				return [
					i + 1, 
					it.materialName || "", 
					it.sentQty, 
					it.recvdQty, 
					it.balQty, 
					it.uom, 
					fRate.toFixed(2), 
					fAmt.toFixed(2)
				];
			});
			doc.autoTable({
				startY: y,
				head: [['S.No', 'DESCRIPTION', 'Sent QTY', 'Received QTY', 'Balance QTY', 'UOM', 'Rate', 'Amount']],
				body: tableData,
				theme: 'grid',
				styles: { fontSize: 8, cellPadding: 2, lineColor: [0, 0, 0], lineWidth: 0.1 },
				headStyles: { fillColor: [255, 255, 255], textColor: [0, 0, 0], fontStyle: 'bold', lineWidth: 0.1 },
				columnStyles: { 
					0: { cellWidth: 10, halign: 'center' }, 
					1: { cellWidth: 'auto' }, 
					2: { cellWidth: 15, halign: 'center' }, 
					3: { cellWidth: 20, halign: 'center' }, 
					4: { cellWidth: 20, halign: 'center' }, 
					5: { cellWidth: 15, halign: 'center' }, 
					6: { cellWidth: 15, halign: 'right' }, 
					7: { cellWidth: 20, halign: 'right' } 
				}
			});

			var finalY = doc.lastAutoTable.finalY;
			var fTotal = oInward.FinalTotal ? oInward.FinalTotal.toString().replace(/,/g, '') : "0";
			var totalAmt = parseFloat(fTotal);

			// Table Footer Row (In Words & Total)
			doc.rect(margin, finalY, pageWidth - margin * 2, 8);
			doc.setFontSize(8); doc.setFont("helvetica", "normal");
			doc.text("In Words - Rupees " + this._numberToWords(Math.round(totalAmt)) + " Only.", margin + 2, finalY + 5);
			doc.line(pageWidth - 60, finalY, pageWidth - 60, finalY + 8);
			doc.setFont("helvetica", "bold"); doc.text("Total", pageWidth - 55, finalY + 5);
			doc.text(totalAmt.toLocaleString(), pageWidth - margin - 2, finalY + 5, { align: "right" });

			doc.save("InwardGP_" + (oInward.GatePassNo || "Draft") + ".pdf");
		},

		onGenerateDC: async function () {
			var oInward = this.getView().getModel("inward").getData();
			const { jsPDF } = window.jspdf;
			var doc = new jsPDF('p', 'mm', 'a4');
			var margin = 10;
			var pageWidth = doc.internal.pageSize.width;
			var sDate = new Date().toLocaleDateString('en-GB').split('/').join('-');

			// --- 1. Header Section ---
			var sLogoUrl = sap.ui.require.toUrl("zgpms/meilpower/com/images/meil_logo.png");
			try {
				var sLogoBase64 = await this._getImageBase64(sLogoUrl);
				doc.addImage(sLogoBase64, 'PNG', margin, 5, 25, 9);
			} catch (e) {
				console.error("Logo load failed", e);
			}
			doc.setFont("helvetica", "bold"); doc.setFontSize(14);
			doc.text("MEIL Neyveli Energy Private Limited", pageWidth / 2, 10, { align: "center" });
			doc.setFontSize(7); doc.setFont("helvetica", "normal");
			doc.text("(Formerly TAGA Neyveli Power Company Private Limited)", pageWidth / 2, 13, { align: "center" });
			doc.text("250MW LFPP, Uthangal, Neyveli, Tamilnadu - 607804, India.", pageWidth / 2, 16, { align: "center" });
			doc.text("Tel : +91-4142-270300 | Fax : +91-4142-270401", pageWidth / 2, 19, { align: "center" });
			doc.setFont("helvetica", "bold");
			doc.text("GSTIN : 33AACCS2753B1ZV | CIN : U40109TN1993PTC026223", pageWidth / 2, 22, { align: "center" });

			doc.setFontSize(11);
			doc.text("DELIVERY CHALLAN (RETURN RECEIPT)", pageWidth / 2, 30, { align: "center" });
			doc.line(pageWidth / 2 - 30, 31, pageWidth / 2 + 30, 31);

			// --- 2. Unified Grid Section ---
			var hY = 35;
			doc.setLineWidth(0.1);
			doc.rect(margin, hY, pageWidth - margin * 2, 45); // Outer Box
			doc.line(75, hY, 75, hY + 45); // Vertical 1
			doc.line(135, hY, 135, hY + 45); // Vertical 2

			// Column 1: From Address (Vendor)
			doc.setFontSize(8); doc.setFont("helvetica", "bold");
			doc.text("Received From", margin + 2, hY + 5);
			doc.text(oInward.VendorName || "", margin + 10, hY + 5);
			doc.setFont("helvetica", "normal");
			var splitToAddr = doc.splitTextToSize(oInward.VendorAddress || "", 55);
			doc.text(splitToAddr, margin + 10, hY + 10);
			doc.setFont("helvetica", "bold");
			doc.text("GST No", margin + 2, hY + 40);
			doc.setFont("helvetica", "normal");
			doc.text(oInward.VendorGST || "", margin + 12, hY + 40);

			// Column 2: Inward Info
			var c2X = 77;
			doc.setFont("helvetica", "bold"); doc.text("Ref RGP No:", c2X, hY + 5);
			doc.setFont("helvetica", "normal"); doc.text(oInward.GatePassNo || "", c2X + 28, hY + 5);
			doc.setFont("helvetica", "bold"); doc.text("Receipt Date:", c2X, hY + 10);
			doc.setFont("helvetica", "normal"); doc.text(sDate, c2X + 28, hY + 10);

			doc.setFont("helvetica", "bold"); doc.text("Mode Of Transport:", c2X, hY + 18);
			doc.setFont("helvetica", "normal"); doc.text(oInward.ModeOfTransport || "By Road", c2X + 28, hY + 18);

			doc.setFont("helvetica", "bold");
			doc.text("LR/Vehicle No/", c2X, hY + 26);
			doc.text("Transporter Name:", c2X, hY + 30);
			doc.setFont("helvetica", "normal");
			doc.text(oInward.VehicleNo || "", c2X + 28, hY + 26);
			var splitTrans = doc.splitTextToSize(oInward.TransporterName || "Self", 40);
			doc.text(splitTrans, c2X + 28, hY + 30);

			// Column 3: Location Info
			var c3X = 137;
			doc.setFont("helvetica", "bold"); doc.text("Plant:", c3X, hY + 5);
			doc.setFont("helvetica", "normal"); doc.text(oInward.Plant || "", c3X + 28, hY + 5);
			doc.setFont("helvetica", "bold"); doc.text("Department:", c3X, hY + 10);
			doc.setFont("helvetica", "normal"); doc.text(oInward.Department || "", c3X + 28, hY + 10);

			doc.setFont("helvetica", "bold"); doc.text("Received At:", c3X, hY + 18);
			doc.setFont("helvetica", "normal"); doc.text("Uthangal, Neyveli", c3X + 28, hY + 18);
			doc.setFont("helvetica", "bold"); doc.text("EWBNo:", c3X, hY + 34);
			doc.setFont("helvetica", "normal"); doc.text(oInward.EWayBillNo || "", c3X + 28, hY + 34);

			// --- 3. Items Table ---
			var tableData = (oInward.items || []).filter(it => parseFloat(it.recvdQty) > 0).map(function (item, index) {
				return [index + 1, item.materialName, "", item.uom, item.recvdQty, parseFloat(item._itemNetPrice || 0).toFixed(2), (parseFloat(item.recvdQty) * parseFloat(item._itemNetPrice || 0)).toFixed(2)];
			});

			doc.autoTable({
				startY: hY + 48,
				head: [['S.No', 'DESCRIPTION', 'HSN Code', 'UOM', 'QTY', 'Rate', 'Amt(In Rs.)']],
				body: tableData,
				theme: 'grid',
				headStyles: { fillColor: [255, 255, 255], textColor: [0, 0, 0], fontStyle: 'bold', lineWidth: 0.1, halign: 'center' },
				styles: { fontSize: 8, cellPadding: 2, lineColor: [0, 0, 0], lineWidth: 0.1 },
				columnStyles: { 0: { cellWidth: 10, halign: 'center' }, 1: { cellWidth: 'auto' }, 2: { cellWidth: 20, halign: 'center' }, 3: { cellWidth: 15, halign: 'center' }, 4: { cellWidth: 15, halign: 'center' }, 5: { cellWidth: 20, halign: 'right' }, 6: { cellWidth: 25, halign: 'right' } }
			});

			var finalY = doc.lastAutoTable.finalY;
			var fTotal = oInward.FinalTotal ? oInward.FinalTotal.toString().replace(/,/g, '') : "0";
			var totalAmt = parseFloat(fTotal);

			// Table Footer Row (In Words & Total)
			doc.rect(margin, finalY, pageWidth - margin * 2, 8);
			doc.setFontSize(8); doc.setFont("helvetica", "normal");
			doc.text("In Words - Rupees " + this._numberToWords(Math.round(totalAmt)) + " Only.", margin + 2, finalY + 5);
			doc.line(pageWidth - 60, finalY, pageWidth - 60, finalY + 8);
			doc.setFont("helvetica", "bold"); doc.text("Total", pageWidth - 55, finalY + 5);
			doc.text(totalAmt.toLocaleString(), pageWidth - margin - 2, finalY + 5, { align: "right" });

			// Note Section
			var y = finalY + 12;
			doc.rect(margin, y, pageWidth - margin * 2, 10);
			doc.setFont("helvetica", "bold"); doc.text("Note :", margin + 2, y + 6);
			doc.setFont("helvetica", "normal"); doc.text("Materials received back against RGP. Transaction for returnable items receipt.", margin + 12, y + 6);

			doc.save("InwardDC_" + (oInward.GatePassNo || "Draft") + ".pdf");
		},

		onInsuranceCheck: function (oEvent) {
			var bSelected = oEvent.getParameter("selected");
			var oInwardModel = this.getView().getModel("inward");
			var oInwardData = oInwardModel ? oInwardModel.getData() : {};

			if (bSelected) {
				if (!this._pInsuranceDialog) {
					this._pInsuranceDialog = sap.ui.core.Fragment.load({
						id: this.getView().getId(),
						name: "zgpms.meilpower.com.view.fragments.InwardInsuranceDialog",
						controller: this
					}).then(function (oDialog) {
						this.getView().addDependent(oDialog);
						var oModel = new sap.ui.model.json.JSONModel({});
						oDialog.setModel(oModel, "insurance");
						return oDialog;
					}.bind(this));
				}
				this._pInsuranceDialog.then(function (oDialog) {
					var oInsModel = oDialog.getModel("insurance");
					oInsModel.setData({
						InvoiceNo: oInwardData.GatePassNo || "",
						InsuranceDate: new Date().toLocaleDateString('en-GB').split('/').join('-'),
						ReceivedDate: oInwardData.ReceivedDate || new Date().toLocaleDateString('en-GB').split('/').join('-'),
						Vendor: oInwardData.Vendor || "",
						VendorAddress: oInwardData.VendorAddress || "",
						ModeOfTransport: oInwardData.ModeOfTransport || "",
						VehicleNo: oInwardData.VehicleNo || "",
						InvoiceValue: oInwardData.FinalTotal ? oInwardData.FinalTotal.toString().replace(/,/g, '') : "",
						RgpDescription: oInwardData.Remarks || oInwardData.DCNotes || ""
					});
					oDialog.open();
				});
			}
		},

		onInsuranceSubmit: function () {
			sap.m.MessageToast.show("Insurance details saved locally. Ready for backend mapping.");
			this.byId("idInsuranceRequired").setSelected(true);
			this._pInsuranceDialog.then(function (oDialog) {
				oDialog.close();
			});
		},

		onInsuranceCancel: function () {
			this.byId("idInsuranceRequired").setSelected(false);
			this._pInsuranceDialog.then(function (oDialog) {
				oDialog.close();
			});
		}
	});
});
