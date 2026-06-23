sap.ui.define([
	"./BaseController",
	"sap/ui/model/json/JSONModel",
	"sap/ui/model/Filter",
	"sap/ui/model/FilterOperator",
	"sap/m/MessageBox",
	"sap/m/MessageToast"
], function (BaseController, JSONModel, Filter, FilterOperator, MessageBox, MessageToast) {
	"use strict";

	return BaseController.extend("zgpms.meilpower.com.controller.PCPManageDetail", {

		onInit: function () {
			this.getView().setModel(new JSONModel({}), "pcpDetail");
			this.getRouter().getRoute("PCPManageDetail").attachMatched(this._onRouteMatched, this);
		},

		_onRouteMatched: function () {
			var oSrc  = sap.ui.getCore().getModel("selectedPCPEntry");
			var oMeta = oSrc ? oSrc.getData() : {};
			var oRow  = oMeta.row  || {};
			var sMode = oMeta.mode || "CREATE";

			this._setModel(oRow, sMode);

			if (sMode === "PRINT" && oRow.GateEntryNo) {
				this._generatePDF(this._buildPrintData(oRow));
			}
		},

		_setModel: function (oRow, sMode) {
			var bEditable = (sMode === "CREATE" || sMode === "EDIT");
			var sTitle    = { "CREATE": "Add PCP", "EDIT": "Edit PCP", "VIEW": "View PCP", "PRINT": "View PCP" }[sMode] || "Add PCP";

			var sGEDate  = this._toYMD(oRow.GEDateRaw || oRow.GEDate || "");
			var sPCPDate = this._toYMD(oRow.PCPDate || "");
			var sDCDate  = this._toYMD(oRow.DCdate  || "");

			if (!sPCPDate) {
				var oToday = new Date();
				sPCPDate = oToday.getFullYear() + "-" +
					String(oToday.getMonth() + 1).padStart(2, "0") + "-" +
					String(oToday.getDate()).padStart(2, "0");
			}

			this.getView().getModel("pcpDetail").setData({
				pageTitle:        sTitle,
				editable:         bEditable,
				mode:             sMode,
				GateEntryNo:      oRow.GateEntryNo      || "",
				GEDateRaw:        oRow.GEDateRaw         || "",
				GEDate:           sGEDate,
				PCPDate:          sPCPDate,
				EntryPoint:       oRow.EntryPoint        || "",
				VendorDesc:       oRow.VendorDesc        || "",
				Vendor:           oRow.Vendor            || "",
				Department:       oRow.Department        || "",
				DCNumber:         oRow.DCNumber          || "",
				DCdate:           sDCDate,
				RGPNumber:        oRow.RGPNumber         || "",
				RRNo:             oRow.RRNo              || "",
				Plant:            oRow.Plant             || "",
				BudgetCode:       oRow.BudgetCode        || "",
				GatepassNo:       (oRow.GatepassNo       || "").trim(),
				ItemDescription:  oRow.ItemDescription   || "",
				RecievedQuantity: parseFloat(oRow.RecievedQuantity || 0),
				UOM:              oRow.UOM               || "",
				TotalCost:        oRow.TotalCost         || "",
				Remarks:          oRow.Remarks           || "",
				InspectionStatus: oRow.InspectionStatus  || "",
				Inspectiondate:   this._toYMD(oRow.Inspectiondate || ""),
				ItemNo:           oRow.ItemNo            || "00010",
				PCPItmNav:        oRow.PCPItmNav         || { results: [] }
			});
		},

		// ── Auto-fetch when GE No changes ────────────────────────────────
		onGENoChange: function () {
			var oModel  = this.getView().getModel("pcpDetail");
			var sGENo   = (oModel.getProperty("/GateEntryNo") || "").trim();
			if (sGENo) { this._fetchGEDetails(sGENo); }
		},

		onGEDateChange: function () {
			var oModel  = this.getView().getModel("pcpDetail");
			var sGENo   = (oModel.getProperty("/GateEntryNo") || "").trim();
			if (sGENo) { this._fetchGEDetails(sGENo); }
		},

		_fetchGEDetails: function (sGENo) {
			var oODataModel = this.getOwnerComponent().getModel();
			if (!oODataModel) { return; }
			var that = this;
			sap.ui.core.BusyIndicator.show(0);

			var aFilters = [new Filter("GateEntryNo", FilterOperator.EQ, sGENo)];
			var sGEDate = (this.getView().getModel("pcpDetail").getProperty("/GEDate") || "").replace(/-/g, "");
			if (sGEDate) {
				aFilters.push(new Filter("GEDate", FilterOperator.EQ, sGEDate));
			}

			oODataModel.read("/PCPHdrSet", {
				filters: aFilters,
				urlParameters: { "$expand": "PCPItmNav" },
				success: function (oData) {
					sap.ui.core.BusyIndicator.hide();
					var aResults = oData.results || [];
					if (aResults.length === 0) {
						MessageBox.warning("No Gate Entry found for GE No: " + sGENo + " on date " + sGEDateSAP);
						return;
					}
					var oItem = aResults[0];
					var oModel = that.getView().getModel("pcpDetail");

					oModel.setProperty("/VendorDesc",  oItem.VendorDesc  || "");
					oModel.setProperty("/Vendor",      oItem.Vendor      || "");
					oModel.setProperty("/Department",  oItem.Department  || "");
					oModel.setProperty("/DCNumber",    oItem.DCNumber    || "");
					oModel.setProperty("/Plant",       oItem.Plant       || "");
					oModel.setProperty("/RRNo",        oItem.RRNo        || "");
					oModel.setProperty("/RGPNumber",   oItem.RGPNumber   || "");
					oModel.setProperty("/GatepassNo",  (oItem.GatepassNo || "").trim());
					oModel.setProperty("/GEDateRaw",   oItem.GEDate      || "");
					oModel.setProperty("/EntryPoint",  oItem.EntryPoint  || "");
					oModel.setProperty("/PCPItmNav",   oItem.PCPItmNav   || { results: [] });
					

					var sDC = that._toYMD(oItem.DCdate || "");
					if (sDC) { oModel.setProperty("/DCdate", sDC); }

					// Fill first item fields
					if (oItem.PCPItmNav && oItem.PCPItmNav.results && oItem.PCPItmNav.results.length > 0) {
						var oItm = oItem.PCPItmNav.results[0];
						oModel.setProperty("/ItemDescription",  oItm.ItemDescription  || "");
						oModel.setProperty("/RecievedQuantity", parseFloat(oItm.RecievedQuantity || 0));
						oModel.setProperty("/UOM",              oItm.UOM              || "");
						oModel.setProperty("/TotalCost",        oItm.TotalCost        || "");
						oModel.setProperty("/ItemNo",           oItm.ItemNo           || "00010");
					}

					MessageToast.show("Gate Entry details loaded.");
				},
				error: function () {
					sap.ui.core.BusyIndicator.hide();
					MessageBox.error("Failed to fetch Gate Entry details.");
				}
			});
		},

		// ── Submit ───────────────────────────────────────────────────────
		onSubmit: function () {
			var oModel = this.getView().getModel("pcpDetail");
			var oData  = oModel.getData();

			if (!oData.EntryPoint)              { MessageBox.warning("Please select Entry Point.");          return; }
			if (!oData.PCPDate)                 { MessageBox.warning("Please select PCP Date.");             return; }
			if (!(oData.GateEntryNo || "").trim()) { MessageBox.warning("Please enter GE No.");             return; }
			if (!oData.Department)              { MessageBox.warning("Please select Department.");           return; }
			if (!(oData.ItemDescription || "").trim()) { MessageBox.warning("Please enter Item Description."); return; }
			if (!oData.UOM)                     { MessageBox.warning("Please select UOM.");                  return; }
			if (!oData.BudgetCode)              { MessageBox.warning("Please select Budget Code.");          return; }

			var fCost = parseFloat(oData.TotalCost || 0);
			if (!oData.TotalCost || fCost <= 0)  { MessageBox.warning("Please enter Total Cost greater than 0."); return; }
			if (fCost > 5000) { MessageBox.error("Total Cost for Petty Cash Purchase cannot be exceed 5000."); return; }

			var oToday = new Date();
			var sTodaySAP = oToday.getFullYear() + "-" +
				String(oToday.getMonth() + 1).padStart(2, "0") + "-" +
				String(oToday.getDate()).padStart(2, "0");
			oData.InspectionStatus = "Completed";
			oData.Inspectiondate = sTodaySAP;
			oModel.refresh(true);

			MessageBox.confirm("Submit PCP and generate Gate Pass Number?", {
				title: "Confirm Submission",
				onClose: function (sAction) {
					if (sAction === MessageBox.Action.OK) { this._doSubmit(oData); }
				}.bind(this)
			});
		},

		_doSubmit: function (oData) {
			var oODataModel = this.getOwnerComponent().getModel();
			if (!oODataModel) { MessageBox.error("SAP system is not connected."); return; }

			var sGEDateSAP  = (oData.GEDate  || "").replace(/-/g, "");
			var sPCPDateSAP = (oData.PCPDate || "").replace(/-/g, "");
			var sDCDateSAP  = (oData.DCdate  || "").replace(/-/g, "");

			var oPayload = {
				GEDate:       sGEDateSAP,
				Plant:        oData.Plant       || "",
				Vendor:       oData.Vendor      || "",
				VendorDesc:   oData.VendorDesc  || "",
				SourceType:   "PettyCash",
				Department:   oData.Department  || "",
				DCNumber:     oData.DCNumber    || "",
				PurchaseOrder:"",
				RRNo:         oData.RRNo        || "",
				GateEntryNo:  oData.GateEntryNo || "",
				GatepassNo:   "",
				PCPDate:      sPCPDateSAP,
				DCdate:       sDCDateSAP,
				BudgetCode:   oData.BudgetCode  || "",
				EntryPoint:   oData.EntryPoint  || "",
				InspectionStatus: oData.InspectionStatus || "",
				Inspectiondate:   (oData.Inspectiondate || "").replace(/-/g, ""),
				Remarks:      oData.Remarks     || "",
				Message:      "",
				PCPItmNav: [{
					SourceType:       "PettyCash",
					ItemNo:           oData.ItemNo || "00010",
					ItemDescription:  oData.ItemDescription || "",
					RecievedQuantity: String(parseFloat(oData.RecievedQuantity || 0).toFixed(3)),
					UOM:              oData.UOM || "",
					TotalCost:        String(parseFloat(oData.TotalCost || 0).toFixed(2)),
					GateEntryNo:      oData.GateEntryNo || "",
					RRNo:             oData.RRNo        || "",
					PurchaseOrder:    "",
					Plant:            oData.Plant       || ""
				}]
			};

			var that = this;
			sap.ui.core.BusyIndicator.show(0);

			oODataModel.refreshSecurityToken(function () {
				oODataModel.create("/PCPHdrSet", oPayload, {
					success: function (oResponse) {
						sap.ui.core.BusyIndicator.hide();
						var sGP = ((oResponse && (oResponse.GatepassNo || oResponse.Message)) || "").trim();

						// Lock the form — PCP is now processed / gate entry closed
						that.getView().getModel("pcpDetail").setProperty("/GatepassNo", sGP || "GENERATED");
						that.getView().getModel("pcpDetail").setProperty("/editable",   false);

						var sMsg = sGP
							? "PCP submitted successfully!\nGate Pass No: " + sGP + "\n\nThe Gate Entry status is now Closed."
							: "PCP submitted successfully. Gate Entry status is now Closed.";

						MessageBox.success(sMsg, {
							title: "Success",
							onClose: function () {
								// Auto-print after submit
								that.onPrint();
							}
						});
					},
					error: function (oError) {
						sap.ui.core.BusyIndicator.hide();
						var sMsg = "Failed to submit PCP.";
						try {
							var oBody = JSON.parse(oError.responseText);
							if (oBody.error && oBody.error.message && oBody.error.message.value) { sMsg = oBody.error.message.value; }
						} catch (e) {
							try {
								var oMatch = (oError.responseText || "").match(/<message[^>]*>([^<]+)<\/message>/i);
								if (oMatch && oMatch[1]) { sMsg = oMatch[1]; }
							} catch (e2) {}
						}
						MessageBox.error(sMsg);
					}
				});
			}, function () {
				sap.ui.core.BusyIndicator.hide();
				MessageBox.error("Failed to refresh security token. Please reload the page.");
			});
		},

		// ── Print ─────────────────────────────────────────────────────────
		onPrint: function () {
			var oData = this.getView().getModel("pcpDetail").getData();
			this._generatePDF(this._buildPrintData(oData));
		},

		_buildPrintData: function (oData) {
			// Convert display dates back for print (they may be yyyy-MM-dd from DatePicker)
			var fnFmt = function (s) {
				if (!s) { return ""; }
				// yyyy-MM-dd → DD-MM-YYYY
				var m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
				if (m) { return m[3] + "-" + m[2] + "-" + m[1]; }
				return s;
			};
			return {
				GateEntryNo:      oData.GateEntryNo      || "",
				GatepassNo:       oData.GatepassNo        || "",
				PCPDate:          fnFmt(oData.PCPDate),
				GEDate:           fnFmt(oData.GEDate),
				EntryPoint:       oData.EntryPoint        || "",
				VendorDesc:       oData.VendorDesc        || "",
				Department:       oData.Department        || "",
				DCNumber:         oData.DCNumber          || "",
				DCdate:           fnFmt(oData.DCdate),
				BudgetCode:       oData.BudgetCode        || "",
				ItemDescription:  oData.ItemDescription   || "",
				RecievedQuantity: oData.RecievedQuantity  || "0.000",
				UOM:              oData.UOM               || "",
				TotalCost:        oData.TotalCost         || "0.00"
			};
		},

		_generatePDF: async function (oData) {
			if (!oData.GateEntryNo) {
				MessageBox.warning("No Gate Entry data available for printing.");
				return;
			}

			var jsPDFLib = window.jspdf;
			if (!jsPDFLib) {
				MessageBox.error("PDF library not loaded. Please refresh the page.");
				return;
			}
			var jsPDF = jsPDFLib.jsPDF;
			var doc     = new jsPDF("p", "mm", "a4");
			var pageW   = doc.internal.pageSize.width;
			var margin  = 14;

			// ── Logo ──────────────────────────────────────────────────────
			var sLogoUrl = sap.ui.require.toUrl("zgpms/meilpower/com/images/meil_logo.png");
			try {
				var sLogoBase64 = await this._getImageBase64(sLogoUrl);
				doc.addImage(sLogoBase64, "PNG", margin, 8, 28, 10);
			} catch (e) {
				doc.setFont("helvetica", "bold"); doc.setFontSize(16); doc.setTextColor(180, 0, 0);
				doc.text("MEIL", margin, 16); doc.setTextColor(0, 0, 0);
			}

			// ── Company header ────────────────────────────────────────────
			doc.setTextColor(0, 0, 0);
			doc.setFont("helvetica", "bold"); doc.setFontSize(14);
			doc.text("MEIL Neyveli Energy Private Limited", pageW / 2, 14, { align: "center" });
			doc.setFont("helvetica", "normal"); doc.setFontSize(8);
			doc.text("(Formerly TAQA Neyveli Power Company Private Limited)", pageW / 2, 19, { align: "center" });
			doc.text("250MW LFPP, Uthangal, Neyveli, Tamilnadu - 607804, India.", pageW / 2, 23, { align: "center" });
			doc.text("Tel : +91-4142-270300  |  Fax : +91-4142-270401", pageW / 2, 27, { align: "center" });
			doc.setFont("helvetica", "bold");
			doc.text("GSTIN : 33AACCS2753B1ZV  |  CIN : U40109TN1993PTCO26223", pageW / 2, 31, { align: "center" });

			// ── Title ─────────────────────────────────────────────────────
			doc.setFontSize(11); doc.setFont("helvetica", "bold");
			doc.text("CASH PURCHASE NOTE", pageW / 2, 41, { align: "center" });
			var titleW = doc.getTextWidth("CASH PURCHASE NOTE");
			doc.setLineWidth(0.3);
			doc.line(pageW / 2 - titleW / 2, 42.5, pageW / 2 + titleW / 2, 42.5);

			// ── Info block ────────────────────────────────────────────────
			var y = 52;
			doc.setFontSize(9); doc.setFont("helvetica", "normal");

			// Left: Vendor Name
			doc.setFont("helvetica", "bold");
			doc.text("Vendor", margin, y);
			doc.text("Name:", margin, y + 5);
			doc.setFont("helvetica", "normal");
			doc.text(oData.VendorDesc || "", margin + 20, y + 5);

			// Middle: PCP No, PCP Date, DC/Inv No, Dept
			var col2 = 85;
			var valCol2 = col2 + 22;
			doc.setFont("helvetica", "bold");
			doc.text("PCP No:",     col2, y);
			doc.text("PCP Date:",   col2, y + 6);
			doc.text("DC/Inv No:",  col2, y + 12);
			doc.text("Dept:",       col2, y + 18);
			doc.setFont("helvetica", "normal");
			doc.text(oData.GatepassNo || "-",     valCol2, y);
			doc.text(oData.PCPDate    || "-",     valCol2, y + 6);
			doc.text(oData.DCNumber   || "-",     valCol2, y + 12);
			doc.text(oData.Department || "-",     valCol2, y + 18);

			// Right: GE No, GE Date, DC/Inv Date, Budget Code
			var col3 = 150;
			var valCol3 = col3 + 25;
			doc.setFont("helvetica", "bold");
			doc.text("GE No",          col3, y);
			doc.text("GE Date:",        col3, y + 6);
			doc.text("DC/Inv Date:",    col3, y + 12);
			doc.text("Budget Code:",    col3, y + 18);
			doc.setFont("helvetica", "normal");
			doc.text(String(oData.GateEntryNo || "-"), valCol3, y);
			doc.text(oData.GEDate   || "-",            valCol3, y + 6);
			doc.text(oData.DCdate   || "-",            valCol3, y + 12);
			doc.text(oData.BudgetCode || "-",          valCol3, y + 18);

			// ── Items table ───────────────────────────────────────────────
			var tableY = y + 27;
			var fQty   = parseFloat(oData.RecievedQuantity || 0);
			var fAmt   = parseFloat(oData.TotalCost        || 0);

			doc.autoTable({
				startY: tableY,
				head: [["S.No", "DESCRIPTION", "UOM", "QTY", "Amount"]],
				body: [["1", oData.ItemDescription || "", oData.UOM || "", fQty.toFixed(2), fAmt.toFixed(2)]],
				theme: "grid",
				headStyles: { fillColor: [255, 255, 255], textColor: [0, 0, 0], fontStyle: "normal", lineWidth: 0.3, lineColor: [0, 0, 0] },
				bodyStyles: { textColor: [0, 0, 0], lineWidth: 0.3, lineColor: [0, 0, 0], cellPadding: 3 },
				columnStyles: { 0: { cellWidth: 20 }, 1: { cellWidth: "auto" }, 2: { cellWidth: 25 }, 3: { cellWidth: 25 }, 4: { cellWidth: 30 } },
				margin: { left: margin, right: margin }
			});

			// ── Footer row: In Words | Total | Amount ─────────────────────
			var finalY = doc.lastAutoTable.finalY;
			var footH  = 9;
			doc.setLineWidth(0.3);
			doc.rect(margin, finalY, pageW - margin * 2, footH);

			var cols        = doc.lastAutoTable.columns;
			var inWordsW    = cols[0].width + cols[1].width + cols[2].width;
			var totalLabelW = cols[3].width;

			doc.line(margin + inWordsW,              finalY, margin + inWordsW,              finalY + footH);
			doc.line(margin + inWordsW + totalLabelW, finalY, margin + inWordsW + totalLabelW, finalY + footH);

			doc.setFontSize(9); doc.setFont("helvetica", "normal");
			doc.text("In Words - Rupees " + this._numberToWords(Math.round(fAmt)) + " Only.", margin + 3, finalY + 6);
			doc.setFont("helvetica", "bold");
			doc.text("Total",              margin + inWordsW + 3,              finalY + 6);
			doc.setFont("helvetica", "normal");
			doc.text(fAmt.toFixed(2),      margin + inWordsW + totalLabelW + 3, finalY + 6);

			// ── Signature ─────────────────────────────────────────────────
			doc.text("For MEIL Neyveli Energy Private Limited", pageW - margin, finalY + 45, { align: "right" });
			doc.text("Authorised Signatory",                   pageW - margin, finalY + 60, { align: "right" });

			doc.save("PCP_" + (oData.GatepassNo || oData.GateEntryNo || "Draft") + ".pdf");
			MessageToast.show("CASH PURCHASE NOTE downloaded.");
		},

		_getImageBase64: function (url) {
			return new Promise(function (resolve, reject) {
				var img = new Image(); img.crossOrigin = "Anonymous";
				img.onload  = function () {
					var c = document.createElement("canvas");
					c.width = img.width; c.height = img.height;
					c.getContext("2d").drawImage(img, 0, 0);
					resolve(c.toDataURL("image/png"));
				};
				img.onerror = reject;
				img.src = url;
			});
		},

		_numberToWords: function (num) {
			var a = ["","One ","Two ","Three ","Four ","Five ","Six ","Seven ","Eight ","Nine ","Ten ","Eleven ","Twelve ","Thirteen ","Fourteen ","Fifteen ","Sixteen ","Seventeen ","Eighteen ","Nineteen "];
			var b = ["","","Twenty","Thirty","Forty","Fifty","Sixty","Seventy","Eighty","Ninety"];
			if ((num = num.toString()).length > 9) { return "overflow"; }
			var n = ("000000000" + num).substr(-9).match(/^(\d{2})(\d{2})(\d{2})(\d{1})(\d{2})$/);
			if (!n) { return ""; }
			var s = "";
			s += (n[1] != 0) ? (a[Number(n[1])] || b[n[1][0]] + " " + a[n[1][1]]) + "Crore " : "";
			s += (n[2] != 0) ? (a[Number(n[2])] || b[n[2][0]] + " " + a[n[2][1]]) + "Lakh "  : "";
			s += (n[3] != 0) ? (a[Number(n[3])] || b[n[3][0]] + " " + a[n[3][1]]) + "Thousand " : "";
			s += (n[4] != 0) ? (a[Number(n[4])] || b[n[4][0]] + " " + a[n[4][1]]) + "Hundred " : "";
			s += (n[5] != 0) ? ((s !== "") ? "and " : "") + (a[Number(n[5])] || b[n[5][0]] + " " + a[n[5][1]]) : "";
			return s;
		},

		_toYMD: function (vDate) {
			if (!vDate) { return ""; }
			if (typeof vDate === "string" && vDate.indexOf("/Date(") === 0) {
				var ms = parseInt(vDate.replace(/\/Date\((\d+)[^)]*\)\//, "$1"), 10);
				vDate = new Date(ms);
			}
			if (typeof vDate === "string" && /^\d{8}$/.test(vDate) && !/^0+$/.test(vDate)) {
				return vDate.slice(0, 4) + "-" + vDate.slice(4, 6) + "-" + vDate.slice(6, 8);
			}
			if (vDate instanceof Date && !isNaN(vDate)) {
				return vDate.getFullYear() + "-" + String(vDate.getMonth() + 1).padStart(2, "0") + "-" + String(vDate.getDate()).padStart(2, "0");
			}
			if (typeof vDate === "string" && /^\d{4}-\d{2}-\d{2}/.test(vDate)) { return vDate.slice(0, 10); }
			return "";
		},

		onNavBack: function () {
			this.getRouter().navTo("PCPManageList");
		}

	});
});
